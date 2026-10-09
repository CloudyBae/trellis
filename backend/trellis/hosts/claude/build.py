import os
from dataclasses import dataclass, field

from ...sessions.models import (
    Agent,
    MsgTurn,
    Phase,
    Run,
    Session,
    ToolTurn,
    Turn,
    Usage,
    UserTurn,
)
from ...sessions.text import pretty_name, summarize
from ...util.javascript import clip, js_trim
from ...util.targets import mentioned_paths, tilde
from ...util.timestamps import secs
from ..completeness import completeness
from ..constants import NO_PROMPT
from ..session_builder import BaseSessionBuilder
from ..sessions import final_state, is_live, trim_turns
from .records import (
    Blocked,
    BuildContext,
    Event,
    Node,
    SessionState,
    SpawnRecord,
    SubagentFile,
    TranscriptFile,
)
from .values import string_or_empty

SETTLE_MS = 5e3
NO_HANDOFF = "No handoff was recorded."


def node_basename(path: str) -> str:
    return path.rstrip("/").rsplit("/", 1)[-1]


def repo_name(cwd: str, main_file: str) -> str:
    if cwd:
        return node_basename(cwd)
    directory = os.path.dirname(main_file) or "."
    return node_basename(directory).removeprefix("-").split("-")[-1]


def subagent_meta(file: TranscriptFile) -> dict[str, object]:
    meta = file.meta if isinstance(file, SubagentFile) else None
    return meta if isinstance(meta, dict) else {}


@dataclass
class CollectedTurns:
    turns: list[Turn] = field(default_factory=list)
    task: str = ""
    handback: Event | None = None
    last_say: Event | None = None
    last_error: Event | None = None
    has_own_turns: bool = False
    has_conversation_turns: bool = False


class AgentBuilder:
    def __init__(self, context: BuildContext) -> None:
        self.context = context

    def tool_turn(self, event: Event, at: int) -> ToolTurn:
        result = self.context.results.get(event.id)
        shown_target = event.target
        if shown_target is None and event.spawn is not None:
            shown_target = event.spawn.description
        if result is not None:
            out = result.out
        else:
            out = "No result yet." if self.context.live else "No result was recorded."
        turn = ToolTurn(
            at=at, kind="tool", name=event.name, target=shown_target or "", out=out
        )
        if result is not None:
            turn.ms = max(0, result.ts - event.ts)
            if result.fail:
                turn.fail = True
        elif self.context.live:
            turn.pending = True
        return turn

    def collect_turns(self, file: TranscriptFile) -> CollectedTurns:
        collected = CollectedTurns()
        user_seen = 0
        for event in file.events:
            at = secs(event.ts, self.context.t0)
            if event.kind == "user":
                user_seen += 1
                if user_seen == 1:
                    collected.task = event.text
                    continue
                collected.turns.append(UserTurn(at=at, kind="user", text=event.text))
            elif event.kind == "interrupt":
                collected.turns.append(
                    UserTurn(at=at, kind="user", text="Interrupted.")
                )
            elif event.kind == "say":
                collected.turns.append(MsgTurn(at=at, kind="msg", text=event.text))
                collected.last_say = event
            elif event.kind == "error":
                collected.turns.append(MsgTurn(at=at, kind="msg", text=event.text))
                collected.last_error = event
            elif event.kind == "handback":
                collected.handback = event
            elif event.kind == "use" and event.id not in self.context.spawned_ids:
                collected.turns.append(self.tool_turn(event, at))
        collected.has_own_turns = bool(collected.turns)
        collected.has_conversation_turns = any(
            turn.kind in ("msg", "user") for turn in collected.turns
        )
        return collected

    def agent(self, node: Node) -> Agent:
        collected = self.collect_turns(node.file)
        trimmed = trim_turns(collected.turns)
        if node.id == 1:
            agent = self.root_agent(node, collected, trimmed)
            if not self.context.live:
                self.end_root(agent, collected)
        else:
            agent = self.subagent(node, collected, trimmed)
            self.end_subagent(agent, node, collected)
        if trimmed:
            agent.trimmed = trimmed
        return agent

    def new_agent(
        self,
        node: Node,
        collected: CollectedTurns,
        trimmed: int,
        name: str,
        task: str,
        sentinel: str,
        context: list[str],
    ) -> Agent:
        is_root = node.id == 1
        agent = Agent(
            id=node.id,
            src="Claude Code",
            start=secs(
                node.start or node.file.first_ts or self.context.t0, self.context.t0
            ),
            context=context,
            file=tilde(node.file.file),
            turns=collected.turns,
            name=name,
            task=task,
            completeness=completeness(
                source="claude",
                is_subagent=not is_root,
                meta_only=not is_root and not node.file.events,
                has_real_task=task != sentinel,
                has_own_turns=collected.has_own_turns,
                has_conversation_turns=collected.has_conversation_turns,
                trimmed=trimmed > 0,
            ),
        )
        if node.file.model:
            agent.model = node.file.model
        if node.file.usage_by_message:
            totals = [
                sum(column) for column in zip(*node.file.usage_by_message.values())
            ]
            agent.usage = Usage(
                input=totals[0],
                output=totals[1],
                cache_read=totals[2],
                cache_write=totals[3],
            )
        return agent

    def root_agent(self, node: Node, collected: CollectedTurns, trimmed: int) -> Agent:
        return self.new_agent(
            node,
            collected,
            trimmed,
            name="Main agent",
            task=collected.task or NO_PROMPT,
            sentinel=NO_PROMPT,
            context=[],
        )

    def end_root(self, agent: Agent, collected: CollectedTurns) -> None:
        last_say = collected.last_say
        last_error = collected.last_error
        agent.end = secs(self.context.last_ts, self.context.t0)
        agent.final = final_state(
            last_error.ts if last_error else None,
            last_say.ts if last_say else None,
        )
        agent.returned = summarize(
            (last_say.text if last_say else "")
            or (last_error.text if last_error else "")
            or "The session ended."
        )

    def subagent(self, node: Node, collected: CollectedTurns, trimmed: int) -> Agent:
        meta = subagent_meta(node.file)
        meta_type = string_or_empty(meta.get("agentType"))
        meta_description = string_or_empty(meta.get("description"))
        spawn = node.spawn.event.spawn if node.spawn else None
        spawn_type = spawn.subagent_type if spawn else None
        parent_id = (
            self.context.id_of_file.get(node.parent_file) if node.parent_file else 0
        )
        task = (
            (spawn.prompt if spawn else "")
            or collected.task
            or meta_description
            or NO_HANDOFF
        )
        agent = self.new_agent(
            node,
            collected,
            trimmed,
            name=pretty_name(meta_type or spawn_type),
            task=task,
            sentinel=NO_HANDOFF,
            context=mentioned_paths(task, self.context.cwd),
        )
        agent.parent = parent_id or 1
        agent.agent_type = meta_type or spawn_type or ""
        agent.brief = (spawn.description if spawn else None) or meta_description or ""
        return agent

    def end_subagent(self, agent: Agent, node: Node, collected: CollectedTurns) -> None:
        file = node.file
        t0 = self.context.t0
        meta = subagent_meta(file)
        spawn = node.spawn.event.spawn if node.spawn else None
        background = (spawn.background if spawn else False) or (
            meta.get("requestShape") == "background"
        )
        result = None
        if node.spawn and not background:
            result = self.context.results.get(node.spawn.event.id)
        ended_at = None
        if collected.handback:
            ended_at = collected.handback.ts
        elif result:
            ended_at = result.ts
        if ended_at is not None and self.context.live and self.resumed(file, ended_at):
            return
        if collected.handback:
            agent.end = secs(collected.handback.ts, t0)
            agent.final = "complete"
            agent.returned = summarize(collected.handback.text)
        elif result:
            agent.end = secs(result.ts, t0)
            agent.final = "failed" if result.fail else "complete"
            agent.returned = summarize(result.out)
        elif not self.context.live:
            last_say = collected.last_say
            agent.end = secs(file.last_ts or self.context.last_ts, t0)
            agent.final = "failed" if collected.last_error else "complete"
            returned = summarize(
                last_say.text
                if last_say
                else "Stopped when the session ended, without a recorded result."
            )
            returned.note = "No explicit return was recorded; this is its last message."
            agent.returned = returned
        if agent.end is not None and agent.end < agent.start:
            agent.end = agent.start

    def resumed(self, file: TranscriptFile, ended_at: float) -> bool:
        return any(
            event.ts > ended_at and event.kind not in ("result", "handback")
            for event in file.events
        )


class SessionBuilder(BaseSessionBuilder):
    def __init__(self, state: SessionState, now: float) -> None:
        self.state = state
        self.now = now
        self.t0 = state.main.first_ts
        self.files: list[TranscriptFile] = [state.main, *state.subs.values()]
        self.last_ts = max(file.last_ts for file in self.files)
        self.results: dict[str | None, Event] = {}
        for file in self.files:
            for event in file.events:
                if event.kind == "result":
                    self.results[event.id] = event
        pending_anywhere = any(
            event.kind == "use" and event.id not in self.results
            for file in self.files
            for event in file.events
        )
        self.live = not state.ended and is_live(now, self.last_ts, pending_anywhere)

    def build_agents(self) -> list[Agent]:
        state = self.state
        now = self.now
        main = state.main
        t0 = self.t0
        files = self.files
        last_ts = self.last_ts
        results = self.results
        live = self.live
        spawn_at: dict[str | None, SpawnRecord] = {}
        for file in files:
            for event in file.events:
                if event.kind == "use" and event.spawn:
                    spawn_at[event.id] = SpawnRecord(file, event)
        nodes = [Node(file=main, key="main", start=t0)]
        for sub in state.subs.values():
            if not sub.first_ts and not isinstance(sub.meta, dict):
                continue
            tool_use_id = subagent_meta(sub).get("toolUseId")
            record = (
                spawn_at.get(tool_use_id)
                if isinstance(tool_use_id, str) and tool_use_id
                else None
            )
            nodes.append(
                Node(
                    file=sub,
                    key=sub.agent_id,
                    start=record.event.ts if record else sub.first_ts,
                    spawn=record,
                    parent_file=record.file if record else main,
                )
            )
        for index, node in enumerate(sorted(nodes[1:], key=lambda node: node.start), 2):
            node.id = index
        nodes[0].id = 1
        context = BuildContext(
            t0=t0,
            cwd=main.cwd,
            live=live,
            last_ts=last_ts,
            results=results,
            spawned_ids={node.spawn.event.id for node in nodes if node.spawn},
            id_of_file={node.file: node.id for node in nodes},
        )
        agent_builder = AgentBuilder(context)
        agents = [agent_builder.agent(node) for node in nodes]

        phases: dict[int, list[Phase]] = {}
        blocked = state.hook.blocked
        if live and blocked:
            owner, phase = self.blocked_phase(blocked, agents, nodes)
            phases[owner.id] = [phase]
        root = agents[0]
        last_root = main.events[-1] if main.events else None
        root_pending = any(
            isinstance(turn, ToolTurn) and turn.pending for turn in root.turns
        )
        if state.hook.stopped_at:
            stopped = state.hook.stopped_at >= last_ts - 1000
        else:
            stopped = (
                last_root is not None
                and last_root.kind == "say"
                and now - last_ts > SETTLE_MS
            )
        if (
            live
            and 1 not in phases
            and not root_pending
            and stopped
            and not any(agent.id != 1 and agent.end is None for agent in agents)
        ):
            phases[1] = [
                Phase(
                    at=secs((last_root.ts if last_root else 0) or last_ts, t0),
                    state="waiting",
                    note="Finished its turn. Waiting for your next message.",
                )
            ]
        for agent_id, listed in phases.items():
            next(agent for agent in agents if agent.id == agent_id).phases = listed
        return agents

    def raw_id(self) -> str | None:
        return self.state.sid

    def session_id(self) -> str:
        return "cc:" + self.state.sid

    def run(self, agents: list[Agent]) -> Run:
        main = self.state.main
        branch = f" ({main.branch})" if main.branch and main.branch != "HEAD" else ""
        return Run(
            name=clip(main.title or main.first_prompt or "Untitled session", 80),
            repo=repo_name(main.cwd, main.file) + branch,
            source="Claude Code",
            file=tilde(main.file) or "",
        )

    def to_session(self, agents: list[Agent]) -> Session:
        session = super().to_session(agents)
        session.hooks = self.state.hook.seen
        return session

    def blocked_phase(
        self, blocked: Blocked, agents: list[Agent], nodes: list[Node]
    ) -> tuple[Agent, Phase]:
        owner: Agent | None = None
        tool_turn: ToolTurn | None = None
        for agent in agents:
            for turn in agent.turns:
                if (
                    isinstance(turn, ToolTurn)
                    and turn.pending
                    and (not blocked.tool or turn.name == blocked.tool)
                    and (tool_turn is None or turn.at >= tool_turn.at)
                ):
                    owner, tool_turn = agent, turn
        if blocked.agent_id:
            named = next((node for node in nodes if node.key == blocked.agent_id), None)
            if named is not None:
                owner = next((agent for agent in agents if agent.id == named.id), owner)
        if owner is None:
            owner = agents[0]
        if tool_turn is not None:
            note = (
                js_trim(
                    f"Waiting for your approval to run {tool_turn.name} {tool_turn.target}"
                )
                + "."
            )
        else:
            note = blocked.message
        at = max(secs(blocked.at, self.t0), tool_turn.at if tool_turn else 0)
        return owner, Phase(at=at, state="blocked", note=note)
