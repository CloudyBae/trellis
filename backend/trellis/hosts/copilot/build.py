from ...sessions.models import (
    Agent,
    MsgTurn,
    Phase,
    Returned,
    Run,
    Session,
    ToolTurn,
    Usage,
    UserTurn,
)
from ...sessions.constants import LIVE_MS
from ...sessions.text import content_text, summarize
from ...util.javascript import clip, js_string, js_trim
from ...util.json_text import js_json
from ...util.limits import MAX_OUT
from ...util.targets import mentioned_paths, tilde
from ...util.timestamps import secs
from ...util.tokens import token_count
from ..completeness import completeness
from ..session_builder import BaseSessionBuilder
from ..sessions import trim_turns
from .fields import field, first_text, number
from .uri import linkless

TOOL_PART_KINDS = ("toolInvocationSerialized", "toolInvocation")


def part_text(part: object) -> str:
    if isinstance(part, dict):
        value = part.get("value")
        if isinstance(value, str):
            return value
        content = part.get("content")
        if isinstance(content, dict) and isinstance(content.get("value"), str):
            return content["value"]
        if isinstance(content, str):
            return content
    return ""


def msg_text(message: object) -> object:
    if isinstance(message, str):
        return message
    found = next(
        (
            value
            for value in (field(message, "value"), field(message, "text"))
            if value is not None
        ),
        None,
    )
    return "" if found is None else found


def content_value(content: object) -> object:
    if isinstance(content, dict):
        found = next(
            (
                value
                for value in (content.get("text"), content.get("value"))
                if value is not None
            ),
            None,
        )
        return js_json(content) if found is None else found
    return content_text(content)


def tool_turn(part: object, at: int) -> ToolTurn:
    tsd = field(part, "toolSpecificData") or {}
    name = js_string(field(part, "toolId") or field(part, "toolName") or "tool")
    if name.startswith("copilot_"):
        name = name[len("copilot_") :]
    target = linkless(
        field(field(tsd, "commandLine"), "original")
        or field(tsd, "command")
        or msg_text(field(part, "invocationMessage"))
        or msg_text(field(part, "pastTenseMessage"))
    )
    details = field(part, "resultDetails")
    output = content_value(
        next(
            (
                value
                for value in (
                    field(details, "output"),
                    field(details, "content"),
                    details,
                )
                if value is not None
            ),
            None,
        )
    ) or linkless(msg_text(field(part, "pastTenseMessage")))
    turn = ToolTurn(
        at=at,
        kind="tool",
        name=name,
        target=clip(target, 140),
        out=clip(output if isinstance(output, str) else js_json(output), MAX_OUT),
    )
    if field(part, "isComplete") is False:
        turn.pending = True
    if field(part, "isConfirmed") is False or field(details, "isError"):
        turn.fail = True
    return turn


def total_elapsed(request: object) -> int | float:
    timings = field(field(request, "result"), "timings")
    return number(field(timings, "totalElapsed")) or 0


class SessionBuilder(BaseSessionBuilder):
    def __init__(self, data: dict, file: str, repo: str, now: float) -> None:
        requests = data.get("requests")
        if not isinstance(requests, list):
            raise TypeError("requests is not an array")
        self.data = data
        self.file = file
        self.repo = repo
        self.requests = requests
        self.t0 = (
            number(field(requests[0], "timestamp"))
            or number(data.get("creationDate"))
            or now
        )
        self.last_request = requests[-1]
        self.last_ts = max(
            number(data.get("lastMessageDate")) or 0,
            (number(field(self.last_request, "timestamp")) or self.t0)
            + total_elapsed(self.last_request),
        )
        self.in_flight = field(self.last_request, "result") is None and not field(
            self.last_request, "isCanceled"
        )
        self.live = self.in_flight or now - self.last_ts < LIVE_MS
        self.root = Agent(
            id=1,
            name="Main agent",
            src="GitHub Copilot",
            start=0,
            task="",
            context=[],
            turns=[],
            completeness="complete",
            file=tilde(file),
        )
        self.agents = [self.root]
        self.sub_by_call: dict[str, Agent] = {}

    def at_seconds(self, milliseconds: float) -> int:
        return secs(milliseconds, self.t0)

    def flush_text(self, owner: Agent, at: int, buffer: str) -> None:
        trimmed = js_trim(buffer)
        if trimmed:
            owner.turns.append(MsgTurn(at=at, kind="msg", text=clip(trimmed, 6000)))

    def build_agents(self) -> list[Agent]:
        for request_index, request in enumerate(self.requests):
            self.add_request(request_index, request)
        for agent in self.agents:
            trimmed = trim_turns(agent.turns)
            if trimmed:
                agent.trimmed = trimmed
        self.close_out()
        self.root.approx_times = True
        self.classify_completeness()
        return self.agents

    def add_usage(self, usage: object) -> None:
        prompt = token_count(field(usage, "promptTokens"))
        completion = token_count(field(usage, "completionTokens"))
        if not prompt and not completion:
            return
        known = self.root.usage
        self.root.usage = Usage(
            input=(known.input if known else 0) + prompt,
            output=(known.output if known else 0) + completion,
            cache_read=0,
            cache_write=0,
        )

    def add_request(self, request_index: int, request: object) -> None:
        request_time = number(field(request, "timestamp")) or self.t0
        self.add_usage(field(request, "usage"))
        model_id = field(request, "modelId")
        if isinstance(model_id, str) and model_id:
            self.root.model = model_id
        elapsed = total_elapsed(request)
        text = linkless(msg_text(field(request, "message")))
        if request_index == 0:
            self.root.task = text or "No prompt was recorded."
        else:
            self.root.turns.append(
                UserTurn(at=self.at_seconds(request_time), kind="user", text=text)
            )
        response = field(request, "response") or []
        if not isinstance(response, list):
            raise TypeError("response is not an array")
        parts = [
            part
            for part in response
            if isinstance(part, dict)
            and (field(part, "kind") in TOOL_PART_KINDS or part_text(part))
        ]
        buffer = ""
        for part_index, part in enumerate(parts):
            offset = elapsed * part_index / (len(parts) - 1) if len(parts) > 1 else 0
            at = self.at_seconds(request_time + offset)
            call_id = field(part, "subAgentInvocationId")
            owner = (
                self.sub_by_call.get(call_id) if isinstance(call_id, str) else None
            ) or self.root
            if field(part, "kind") in TOOL_PART_KINDS:
                self.flush_text(owner, at, buffer)
                buffer = ""
                self.add_tool_part(request, part, owner, at)
            else:
                buffer += part_text(part)
        self.flush_text(self.root, self.at_seconds(request_time + elapsed), buffer)
        for subagent in self.sub_by_call.values():
            if subagent.end is not None and subagent.turns:
                subagent.end = max(subagent.end, subagent.turns[-1].at)
        error_details = field(field(request, "result"), "errorDetails")
        if error_details:
            message = js_string(field(error_details, "message") or "unknown error")
            self.root.turns.append(
                MsgTurn(
                    at=self.at_seconds(request_time + elapsed),
                    kind="msg",
                    text=f"Request failed: {message}",
                )
            )

    def add_tool_part(
        self, request: object, part: object, owner: Agent, at: int
    ) -> None:
        tsd = field(part, "toolSpecificData") or {}
        tool_id = js_string(field(part, "toolId") or "")
        if "subagent" in tool_id.lower() or field(tsd, "kind") == "subagent":
            self.add_subagent(request, part, tsd, owner, at)
        else:
            owner.turns.append(tool_turn(part, at))

    def add_subagent(
        self, request: object, part: object, tsd: object, owner: Agent, at: int
    ) -> None:
        task = first_text(
            field(tsd, "prompt"),
            field(tsd, "description"),
            linkless(msg_text(field(part, "invocationMessage"))),
        )
        agent = Agent(
            id=len(self.agents) + 1,
            parent=owner.id,
            name=first_text(field(tsd, "agentName")) or "Subagent",
            src="GitHub Copilot",
            start=at,
            task=task,
            context=mentioned_paths(task),
            turns=[],
            completeness="complete",
            file=tilde(self.file),
        )
        if isinstance(tsd, dict) and "description" in tsd:
            description = tsd["description"]
            if description is None or isinstance(description, str):
                agent.brief = description
        if field(part, "isComplete") is not False and (
            field(tsd, "result") is not None or field(request, "result") is not None
        ):
            agent.end = at
            agent.final = (
                "failed"
                if field(field(part, "resultDetails"), "isError")
                else "complete"
            )
            agent.returned = summarize(
                content_value(field(tsd, "result"))
                or linkless(msg_text(field(part, "pastTenseMessage")))
                or "Finished."
            )
        self.agents.append(agent)
        call_id = field(part, "toolCallId")
        if isinstance(call_id, str):
            self.sub_by_call[call_id] = agent

    def close_out(self) -> None:
        root = self.root
        if not self.live:
            last_message = next(
                (turn for turn in reversed(root.turns) if isinstance(turn, MsgTurn)),
                None,
            )
            root.end = self.at_seconds(self.last_ts)
            root.final = (
                "failed"
                if field(field(self.last_request, "result"), "errorDetails")
                else "complete"
            )
            root.returned = summarize(
                (last_message.text if last_message else "") or "The chat ended."
            )
            for agent in self.agents:
                if agent.end is None:
                    agent.end = root.end
                    agent.final = "complete"
                    agent.returned = Returned(
                        summary="No result was recorded.", items=[]
                    )
        elif not self.in_flight:
            root.phases = [
                Phase(
                    at=self.at_seconds(self.last_ts),
                    state="waiting",
                    note="Finished its turn. Waiting for your next message.",
                )
            ]

    def classify_completeness(self) -> None:
        for agent in self.agents:
            task = agent.task
            has_msg_turns = any(turn.kind == "msg" for turn in agent.turns)
            has_user_turns = any(turn.kind == "user" for turn in agent.turns)
            agent.completeness = completeness(
                source="copilot",
                is_subagent=agent.id != 1,
                meta_only=False,
                has_real_task=task not in ("No prompt was recorded.", ""),
                has_own_turns=bool(agent.turns),
                has_conversation_turns=has_msg_turns or has_user_turns,
                trimmed=(agent.trimmed or 0) > 0,
            )

    def raw_session_id(self) -> str:
        return first_text(self.data.get("sessionId"))

    def session_id(self) -> str:
        return "copilot:" + (self.raw_session_id() or self.file)

    def run(self, agents: list[Agent]) -> Run:
        return Run(
            name=clip(
                first_text(self.data.get("customTitle"))
                or self.root.task.split("\n")[0],
                80,
            ),
            repo=self.repo,
            source="GitHub Copilot",
            file=tilde(self.file) or "",
        )

    def to_session(self, agents: list[Agent]) -> Session:
        session = Session(
            id=self.session_id(),
            live=self.live,
            t0=self.t0,
            end_at=self.at_seconds(self.last_ts),
            run=self.run(agents),
            agents=agents,
        )
        if self.raw_session_id():
            session.raw_id = self.raw_session_id()
        return session
