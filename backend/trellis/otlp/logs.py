import math

from ..sessions.models import (
    Agent,
    MsgTurn,
    Returned,
    Run,
    Session,
    ToolTurn,
    Turn,
    UserTurn,
)
from ..sessions.constants import LIVE_MS
from ..util.javascript import ascii_lower, clip, js_string
from ..util.limits import MAX_OUT, MAX_TURNS
from ..util.targets import target_of
from ..util.timestamps import secs
from .attributes import attr_text
from .records import LogEntry, LogState

NO_PROMPT = "No prompt was recorded in the logs."
REDACTED = "<REDACTED>"
REJECTION_WORDS = ("reject", "denied", "abort")


def matches_rejection(decision: object) -> bool:
    lowered = ascii_lower(js_string(decision))
    return any(word in lowered for word in REJECTION_WORDS)


def number_of(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        if not value.isascii() or "_" in value:
            return None
        try:
            number = float(value)
        except ValueError:
            return None
        return number if math.isfinite(number) else None
    return None


def tool_turn_of(record: LogEntry, first_ts: float) -> ToolTurn:
    attributes = record.attributes
    ok = js_string(attributes.get("success")) != "false"
    duration = number_of(attributes.get("duration_ms"))
    turn = ToolTurn(
        at=secs(record.ts - (duration or 0), first_ts),
        kind="tool",
        name=attr_text(attributes, "tool_name")
        or attr_text(attributes, "name")
        or "tool",
        target=target_of(
            next(
                (
                    value
                    for value in (
                        attributes.get("tool_parameters"),
                        attributes.get("arguments"),
                        attributes.get("tool_input"),
                    )
                    if value is not None
                ),
                None,
            )
        ),
        out=clip(
            next(
                (
                    value
                    for value in (
                        attributes.get("output"),
                        attributes.get("error"),
                        "" if ok else "Failed.",
                    )
                    if value is not None
                ),
                None,
            ),
            MAX_OUT,
        ),
    )
    if duration is not None:
        turn.ms = duration
    if not ok:
        turn.fail = True
    return turn


def decision_turn_of(record: LogEntry, at: int) -> MsgTurn | None:
    attributes = record.attributes
    if not matches_rejection(attributes.get("decision")):
        return None
    tool = attr_text(attributes, "tool_name") or "A tool"
    shown = attr_text(attributes, "source") or attr_text(attributes, "decision")
    return MsgTurn(at=at, kind="msg", text=f"{tool} was not approved ({shown}).")


def api_error_turn_of(record: LogEntry, at: int) -> MsgTurn:
    attributes = record.attributes
    shown = (
        attr_text(attributes, "error")
        or attr_text(attributes, "status_code")
        or "unknown"
    )
    return MsgTurn(at=at, kind="msg", text=f"API error: {shown}")


def prompt_placeholder(attributes: dict[str, object]) -> str:
    length = next(
        (
            value
            for value in (attributes.get("prompt_length"), "unknown")
            if value is not None
        ),
        None,
    )
    return (
        f"A prompt of {js_string(length)} characters "
        "(prompt text is not exported unless the tool is told to log it)."
    )


def build_logs(state: LogState, now: float) -> Session:
    records = sorted(state.records, key=lambda record: record.ts)
    first_ts = records[0].ts
    live = now - state.last_ts < LIVE_MS
    turns: list[Turn] = []
    task = ""
    real_prompt = False
    for record in records:
        attributes = record.attributes
        at = secs(record.ts, first_ts)
        if record.event == "user_prompt":
            prompt = attr_text(attributes, "prompt")
            is_real = bool(prompt) and prompt != REDACTED
            text = prompt if is_real else prompt_placeholder(attributes)
            if not task:
                task = text
                real_prompt = is_real
            else:
                turns.append(UserTurn(at=at, kind="user", text=text))
        elif record.event == "tool_result":
            turns.append(tool_turn_of(record, first_ts))
        elif record.event == "tool_decision":
            decision_turn = decision_turn_of(record, at)
            if decision_turn is not None:
                turns.append(decision_turn)
        elif record.event == "api_error":
            turns.append(api_error_turn_of(record, at))
    task = task or NO_PROMPT
    dropped = max(0, len(turns) - MAX_TURNS)
    del turns[:dropped]
    root = Agent(
        id=1,
        name="Main agent",
        src=state.source,
        start=0,
        task=task,
        context=[],
        turns=turns,
        completeness="partial" if real_prompt else "activity_only",
    )
    if dropped:
        root.trimmed = dropped
    if not live:
        root.end = secs(state.last_ts, first_ts)
        root.final = "complete"
        root.returned = Returned(summary="The log stream went quiet.", items=[])
    return Session(
        id="otel-log:" + state.key,
        raw_id=state.key,
        live=live,
        t0=first_ts,
        end_at=secs(state.last_ts, first_ts),
        via="logs",
        run=Run(
            name=clip(task.split("\n")[0], 80),
            repo="",
            source=state.source,
            file="OpenTelemetry logs",
        ),
        agents=[root],
    )
