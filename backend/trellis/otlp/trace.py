from dataclasses import dataclass, field

from ..sessions.models import Agent, Completeness, Final, Returned, Run, Session
from ..sessions.models import Usage
from ..sessions.models import MsgTurn, ToolTurn, Turn
from ..sessions.constants import LIVE_MS
from ..sessions.text import summarize
from ..util.javascript import JS_WHITESPACE, clip
from ..util.limits import MAX_OUT, MAX_TURNS
from ..util.targets import target_of
from ..util.timestamps import secs
from .attributes import attr_text, messages_text, model_of, text_of, usage_of
from .records import SpanRecord, TraceState

MAX_HOPS = 64
NO_TASK = "No task was recorded in the trace."
AGENT_OPERATIONS = ("invoke_agent", "create_agent")
AGENT_PREFIXES = ("invoke_agent", "create_agent")
TOOL_PREFIXES = ("execute_tool",)
NAME_OPERATIONS = ("invoke_agent", "execute_tool", "chat")
SYNTHETIC_ROOT_ID = "_root"


def operation_of(span: SpanRecord) -> str:
    operation = attr_text(span.attributes, "gen_ai.operation.name")
    if operation:
        return operation
    for candidate in NAME_OPERATIONS:
        if span.name.startswith(candidate):
            return candidate
    return ""


def trace_completeness(
    *, has_task: bool, has_output: bool, trimmed: bool
) -> Completeness:
    if has_task and has_output:
        return "partial" if trimmed else "complete"
    if has_task or has_output:
        return "partial"
    return "activity_only"


def without_prefix(name: str, prefixes: tuple[str, ...]) -> str:
    for prefix in prefixes:
        if name.startswith(prefix):
            return name[len(prefix) :].lstrip(JS_WHITESPACE)
    return name


def agent_name_of(span: SpanRecord, is_root: bool) -> str:
    return (
        attr_text(span.attributes, "gen_ai.agent.name")
        or without_prefix(span.name, AGENT_PREFIXES)
        or ("Main agent" if is_root else "Agent")
    )


def agent_task_of(attributes: dict[str, object]) -> str:
    return (
        attr_text(attributes, "gen_ai.agent.description")
        or messages_text(attributes.get("gen_ai.input.messages"), "user")
        or attr_text(attributes, "gen_ai.prompt")
    )


@dataclass
class AgentDraft:
    span: SpanRecord
    name: str
    task: str
    has_output: bool
    start: int
    end: int | None
    final: Final | None
    returned: Returned | None
    parent_number: int | None
    model: str = ""
    usage: Usage | None = None
    chat_usage: list[Usage] = field(default_factory=list)
    turns: list[Turn] = field(default_factory=list)


class TraceBuilder:
    def __init__(self, state: TraceState, now: float) -> None:
        self.state = state
        self.spans = list(state.spans.values())
        self.first_start = min(span.start for span in self.spans)
        self.live = now - state.last_ts < LIVE_MS
        self.placeholders: dict[str, SpanRecord] = {}

    def agent_of(self, span: SpanRecord) -> SpanRecord | None:
        parent = span.parent
        hops = 0
        while parent:
            if hops >= MAX_HOPS:
                break
            hops += 1
            found = self.state.spans.get(parent)
            if found is None:
                if parent not in self.placeholders:
                    self.placeholders[parent] = SpanRecord(
                        id=parent,
                        parent="",
                        name="invoke_agent",
                        attributes={},
                        start=span.start,
                        end=0,
                        error=False,
                        status="",
                        is_open=True,
                    )
                return self.placeholders[parent]
            if operation_of(found) in AGENT_OPERATIONS:
                return found
            parent = found.parent
        return None

    def synthetic_root(self) -> SpanRecord:
        return SpanRecord(
            id=SYNTHETIC_ROOT_ID,
            parent="",
            name="Agent",
            attributes={},
            start=self.first_start,
            end=0 if self.live else int(self.state.last_ts),
            error=False,
            status="",
            is_open=self.live,
        )

    def ordered_agents(
        self, agent_spans: list[SpanRecord]
    ) -> tuple[list[SpanRecord], dict[str, SpanRecord | None]]:
        parent_agent: dict[str, SpanRecord | None] = {}
        for span in agent_spans:
            if span.is_open and span.id not in self.state.spans:
                parent_agent[span.id] = None
            else:
                parent_agent[span.id] = self.agent_of(span)
        roots = sorted(
            (span for span in agent_spans if parent_agent[span.id] is None),
            key=lambda span: span.start,
        )
        root = roots[0]
        for candidate in roots:
            if candidate is not root:
                parent_agent[candidate.id] = root
        others = sorted(
            (span for span in agent_spans if span is not root),
            key=lambda span: span.start,
        )
        return [root, *others], parent_agent

    def draft_of(
        self, span: SpanRecord, is_root: bool, parent_number: int | None
    ) -> AgentDraft:
        output_text = messages_text(
            span.attributes.get("gen_ai.output.messages"), "assistant"
        )
        end: int | None = None
        final: Final | None = None
        returned: Returned | None = None
        if span.end and not span.is_open:
            end = secs(span.end, self.first_start)
            final = "failed" if span.error else "complete"
            returned = summarize(
                output_text or span.status or ("Failed." if span.error else "Finished.")
            )
        return AgentDraft(
            span=span,
            name=agent_name_of(span, is_root),
            task=agent_task_of(span.attributes),
            has_output=bool(output_text),
            start=secs(span.start, self.first_start),
            end=end,
            final=final,
            returned=returned,
            parent_number=parent_number,
            model=model_of(span.attributes),
            usage=usage_of(span.attributes),
        )

    def tool_turn(self, span: SpanRecord) -> ToolTurn:
        attributes = span.attributes
        turn = ToolTurn(
            at=secs(span.start, self.first_start),
            kind="tool",
            name=attr_text(attributes, "gen_ai.tool.name")
            or without_prefix(span.name, TOOL_PREFIXES),
            target=target_of(attributes.get("gen_ai.tool.call.arguments")),
            out=clip(
                text_of(attributes.get("gen_ai.tool.call.result")) or span.status,
                MAX_OUT,
            ),
            ms=max(0, span.end - span.start),
        )
        if span.error:
            turn.fail = True
        return turn

    def build(self) -> Session:
        tools = [span for span in self.spans if operation_of(span) == "execute_tool"]
        chats = [span for span in self.spans if operation_of(span) == "chat"]
        agent_spans = [
            span for span in self.spans if operation_of(span) in AGENT_OPERATIONS
        ]
        for span in [*tools, *chats, *agent_spans]:
            self.agent_of(span)
        agent_spans = [*agent_spans, *self.placeholders.values()]
        if not agent_spans:
            agent_spans = [self.synthetic_root()]
        ordered, parent_agent = self.ordered_agents(agent_spans)
        numbers = {span.id: index + 1 for index, span in enumerate(ordered)}
        drafts: list[AgentDraft] = []
        for index, span in enumerate(ordered):
            parent_span = parent_agent[span.id]
            drafts.append(
                self.draft_of(
                    span,
                    index == 0,
                    None if parent_span is None else numbers[parent_span.id],
                )
            )
        draft_by_id = {draft.span.id: draft for draft in drafts}

        def owner_turns(span: SpanRecord) -> list[Turn]:
            owner = self.agent_of(span)
            owner_draft = draft_by_id.get(owner.id if owner else "", drafts[0])
            return owner_draft.turns

        for span in tools:
            owner_turns(span).append(self.tool_turn(span))
        for span in chats:
            chat_owner = draft_by_id.get((self.agent_of(span) or span).id, drafts[0])
            chat_owner.model = model_of(span.attributes) or chat_owner.model
            chat_usage = usage_of(span.attributes)
            if chat_usage is not None:
                chat_owner.chat_usage.append(chat_usage)
            text = messages_text(
                span.attributes.get("gen_ai.output.messages"), "assistant"
            )
            if text:
                owner_turns(span).append(
                    MsgTurn(
                        at=secs(span.end or span.start, self.first_start),
                        kind="msg",
                        text=clip(text, 6000),
                    )
                )
        agents = [self.agent_of_draft(draft, numbers) for draft in drafts]
        if len(agents) > 1 and agents[0].name == "Main agent":
            agents[0].name = "Orchestrator"
        root = drafts[0].span
        return Session(
            id="otel:" + self.state.key,
            raw_id=self.state.key,
            live=self.live,
            t0=self.first_start,
            end_at=secs(self.state.last_ts, self.first_start),
            via="traces",
            run=Run(
                name=clip(agents[0].task.split("\n")[0], 80),
                repo=attr_text(root.attributes, "service.name"),
                source=self.state.source,
                file="OpenTelemetry traces",
            ),
            agents=agents,
        )

    def agent_of_draft(self, draft: AgentDraft, numbers: dict[str, int]) -> Agent:
        turns = draft.turns
        turns.sort(key=lambda turn: turn.at)
        has_message_turn = any(turn.kind == "msg" for turn in turns)
        dropped = max(0, len(turns) - MAX_TURNS)
        del turns[:dropped]
        agent = Agent(
            id=numbers[draft.span.id],
            name=draft.name,
            src=self.state.source,
            start=draft.start,
            task=clip(draft.task or NO_TASK, 12000),
            context=[],
            turns=turns,
            completeness=trace_completeness(
                has_task=bool(draft.task),
                has_output=draft.has_output or has_message_turn,
                trimmed=dropped > 0,
            ),
        )
        if draft.parent_number is not None:
            agent.parent = draft.parent_number
        if draft.model:
            agent.model = draft.model
        if draft.chat_usage:
            agent.usage = Usage(
                input=sum(usage.input for usage in draft.chat_usage),
                output=sum(usage.output for usage in draft.chat_usage),
                cache_read=sum(usage.cache_read for usage in draft.chat_usage),
                cache_write=sum(usage.cache_write for usage in draft.chat_usage),
            )
        elif draft.usage is not None:
            agent.usage = draft.usage
        if dropped:
            agent.trimmed = dropped
        if draft.end is not None:
            agent.end = draft.end
            agent.final = draft.final
            agent.returned = draft.returned
        elif not self.live:
            agent.end = secs(self.state.last_ts, self.first_start)
            agent.final = "complete"
            agent.returned = Returned(
                summary="The trace ended without this agent's span.", items=[]
            )
        return agent


def build_trace(state: TraceState, now: float) -> Session:
    return TraceBuilder(state, now).build()
