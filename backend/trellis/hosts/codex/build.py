from collections.abc import Callable

from ...sessions.models import (
    Agent,
    MsgTurn,
    Phase,
    Run,
    ToolTurn,
    UserTurn,
)
from ...sessions.text import pretty_name, summarize
from ...util.javascript import clip
from ...util.targets import mentioned_paths, tilde
from ...util.timestamps import secs
from ..completeness import completeness
from ..constants import NO_PROMPT
from ..session_builder import BaseSessionBuilder
from ..sessions import final_state, is_live, trim_turns
from .records import AgentTurns, CallKey, CodexFile, Event, TreeNode


def base_name(path: str) -> str:
    return path.rstrip("/").rsplit("/", 1)[-1]


def has_pending_call(file_record: CodexFile) -> bool:
    resolved = {
        event.call_key for event in file_record.events if event.kind == "result"
    }
    return any(
        event.kind == "use" and not event.done and event.call_key not in resolved
        for event in file_record.events
    )


class SessionBuilder(BaseSessionBuilder):
    def __init__(
        self,
        root_file: CodexFile,
        kids_of: Callable[[CodexFile], list[CodexFile]],
        now: float,
    ) -> None:
        self.root_file = root_file
        self.kids_of = kids_of
        self.tree: list[TreeNode] = []
        self.add(root_file, None)
        self.t0 = root_file.first_ts
        self.last_ts = max(node.file.last_ts for node in self.tree)
        pending_anywhere = any(has_pending_call(node.file) for node in self.tree)
        self.live = is_live(now, self.last_ts, pending_anywhere)
        self.order = [self.tree[0]] + sorted(
            self.tree[1:], key=lambda node: node.file.first_ts
        )
        for index, node in enumerate(self.order):
            node.id = index + 1
        self.id_of = {node.file: node.id for node in self.order}
        self.root_cwd = root_file.cwd

    def add(self, file_record: CodexFile, parent: CodexFile | None) -> None:
        self.tree.append(TreeNode(file_record, parent))
        for kid in sorted(self.kids_of(file_record), key=lambda kid: kid.first_ts):
            self.add(kid, file_record)

    def tool_turn(
        self, event: Event, at: float, results: dict[CallKey, Event]
    ) -> ToolTurn:
        result = results.get(event.call_key)
        if result is not None:
            shown = result.out
        elif event.done:
            shown = ""
        elif self.live:
            shown = "No result yet."
        else:
            shown = "No result was recorded."
        tool = ToolTurn(
            at=at, kind="tool", name=event.name, target=event.target, out=shown
        )
        if result is not None:
            if result.ms is not None:
                tool.ms = result.ms
            else:
                tool.ms = max(0, result.ts - event.ts)
            if result.fail:
                tool.fail = True
        elif self.live and not event.done:
            tool.pending = True
        return tool

    def collect_turns(
        self, file_record: CodexFile, results: dict[CallKey, Event]
    ) -> AgentTurns:
        collected = AgentTurns()
        user_kind = "user" if file_record.has_event_user else "ruser"
        users = 0
        for event in file_record.events:
            at = secs(event.ts, self.t0)
            if event.kind == user_kind:
                users += 1
                if users == 1:
                    collected.task = event.text
                else:
                    collected.turns.append(
                        UserTurn(at=at, kind="user", text=event.text)
                    )
                    collected.uses.append(None)
            elif event.kind == "interrupt":
                collected.turns.append(
                    UserTurn(at=at, kind="user", text="Interrupted.")
                )
                collected.uses.append(None)
            elif event.kind == "say":
                collected.turns.append(MsgTurn(at=at, kind="msg", text=event.text))
                collected.uses.append(None)
                collected.last_say = event
            elif event.kind == "error":
                collected.turns.append(MsgTurn(at=at, kind="msg", text=event.text))
                collected.uses.append(None)
                collected.last_error = event
            elif event.kind == "done":
                collected.done = event
            elif event.kind == "use":
                collected.turns.append(self.tool_turn(event, at, results))
                collected.uses.append(event)
        return collected

    def mark_ended(self, agent: Agent, node: TreeNode, collected: AgentTurns) -> None:
        done = collected.done
        last_say = collected.last_say
        last_error = collected.last_error
        is_subagent = node.parent is not None
        ended = (done is not None or not self.live) if is_subagent else not self.live
        if not ended:
            return
        agent.end = secs(done.ts if done else node.file.last_ts, self.t0)
        agent.final = final_state(
            last_error.ts if last_error else None,
            last_say.ts if last_say else None,
        )
        agent.returned = summarize(
            (done.returned if done else "")
            or (last_say.text if last_say else "")
            or "The session ended."
        )

    def phases_for(
        self,
        node: TreeNode,
        collected: AgentTurns,
        results: dict[CallKey, Event],
    ) -> list[Phase] | None:
        done = collected.done
        pending_use = next(
            (
                use
                for turn, use in zip(
                    reversed(collected.turns), reversed(collected.uses), strict=True
                )
                if use is not None and isinstance(turn, ToolTurn) and turn.pending
            ),
            None,
        )
        open_approval = None
        if self.live:
            unresolved = [
                event
                for event in node.file.events
                if event.kind == "approval" and event.call_key not in results
            ]
            open_approval = unresolved[-1] if unresolved else None
        if open_approval is not None and pending_use is not None:
            return [
                Phase(
                    at=secs(open_approval.ts, self.t0),
                    state="blocked",
                    note=(
                        "Waiting for your approval to run "
                        f"{pending_use.name_text} {pending_use.target}."
                    ),
                )
            ]
        if (
            node.parent is None
            and self.live
            and done is not None
            and done.ts >= self.last_ts - 1000
            and pending_use is None
        ):
            return [
                Phase(
                    at=secs(done.ts, self.t0),
                    state="waiting",
                    note="Finished its turn. Waiting for your next message.",
                )
            ]
        return None

    def agent(self, node: TreeNode) -> Agent:
        file_record = node.file
        results = {
            event.call_key: event
            for event in file_record.events
            if event.kind == "result"
        }
        collected = self.collect_turns(file_record, results)
        shown_task = collected.task or NO_PROMPT
        has_own_turns = bool(collected.turns)
        has_conversation_turns = any(
            turn.kind in ("msg", "user") for turn in collected.turns
        )
        dropped = trim_turns(collected.turns)
        del collected.uses[:dropped]
        is_subagent = node.parent is not None
        agent = Agent(
            id=node.id,
            name=(
                pretty_name(file_record.agent_name or "Subagent")
                if is_subagent
                else "Main agent"
            ),
            src="Codex",
            start=secs(file_record.first_ts, self.t0),
            task=shown_task,
            context=(mentioned_paths(shown_task, self.root_cwd) if is_subagent else []),
            turns=collected.turns,
            file=tilde(file_record.file),
            completeness=completeness(
                source="codex",
                is_subagent=is_subagent,
                meta_only=False,
                has_real_task=shown_task != NO_PROMPT,
                has_own_turns=has_own_turns,
                has_conversation_turns=has_conversation_turns,
                trimmed=dropped > 0,
            ),
        )
        if dropped > 0:
            agent.trimmed = dropped
        if file_record.model:
            agent.model = file_record.model
        if file_record.usage is not None:
            agent.usage = file_record.usage
        if node.parent is not None:
            agent.parent = self.id_of[node.parent]
        self.mark_ended(agent, node, collected)
        phases = self.phases_for(node, collected, results)
        if phases is not None:
            agent.phases = phases
        return agent

    def build_agents(self) -> list[Agent]:
        return [self.agent(node) for node in self.order]

    def raw_id(self) -> str | None:
        return self.root_file.sid or None

    def session_id(self) -> str:
        return "codex:" + (self.root_file.sid or self.root_file.file)

    def run(self, agents: list[Agent]) -> Run:
        root_file = self.root_file
        repo = base_name(root_file.cwd) if root_file.cwd else ""
        if root_file.branch:
            repo += f" ({root_file.branch})"
        return Run(
            name=clip(agents[0].task.split("\n")[0], 80),
            repo=repo,
            source="Codex",
            file=tilde(root_file.file) or "",
        )
