import math

from ...sessions.models import Usage
from ...sessions.text import clean_user_text, content_text
from ...util.javascript import (
    LINE_TERMINATORS,
    ascii_lower,
    clip,
    js_string,
    js_trim,
    parse_json,
)
from ...util.json_text import js_json
from ...util.limits import MAX_OUT
from ...util.targets import target_of
from ...util.timestamps import timestamp_ms
from ...util.tokens import token_count
from .records import CallKey, CodexFile, Event

EXIT_CODE_PREFIX = "Exit code: "
ASCII_DIGITS = "0123456789"
PATCH_PREFIXES = (
    "*** Update File: ",
    "*** Add File: ",
    "*** Delete File: ",
)
INSTRUCTION_HEADERS = ("# AGENTS.md", "<environment_context>", "<user_instructions>")


def is_zero_number(value: object) -> bool:
    return (
        isinstance(value, (int, float)) and not isinstance(value, bool) and value == 0
    )


def call_key_of(value: object) -> CallKey:
    return value if isinstance(value, str) else None


def non_empty_text(*candidates: object) -> str:
    return next(
        (
            candidate
            for candidate in candidates
            if isinstance(candidate, str) and candidate
        ),
        "",
    )


def duration_milliseconds(duration: object) -> float | None:
    if isinstance(duration, bool):
        return None
    if isinstance(duration, str):
        if "_" in duration:
            return None
        try:
            duration = float(duration)
        except ValueError:
            return None
    if not isinstance(duration, (int, float)) or not math.isfinite(duration):
        return None
    scaled = duration * 1000 + 0.5
    if not math.isfinite(scaled):
        return None
    return math.floor(scaled)


def first_exit_code_digits(text: str) -> str | None:
    line_starts = [0] + [
        index + 1 for index, char in enumerate(text) if char in LINE_TERMINATORS
    ]
    for start in line_starts:
        if not text.startswith(EXIT_CODE_PREFIX, start):
            continue
        digits_start = start + len(EXIT_CODE_PREFIX)
        digits_end = digits_start
        while digits_end < len(text) and text[digits_end] in ASCII_DIGITS:
            digits_end += 1
        if digits_end > digits_start:
            return text[digits_start:digits_end]
    return None


def parse_output(raw: object) -> tuple[str, bool, float | None]:
    output: object = raw
    failed = False
    milliseconds: float | None = None
    if isinstance(raw, str):
        try:
            parsed = parse_json(raw)
        except ValueError:
            parsed = None
        if isinstance(parsed, (dict, list)):
            fields = parsed if isinstance(parsed, dict) else {}
            metadata = fields.get("metadata")
            metadata_fields = metadata if isinstance(metadata, dict) else {}
            output = next(
                (
                    value
                    for value in (fields.get("output"), fields.get("content"), raw)
                    if value is not None
                ),
                None,
            )
            code = next(
                (
                    value
                    for value in (
                        metadata_fields.get("exit_code"),
                        fields.get("exit_code"),
                    )
                    if value is not None
                ),
                None,
            )
            if code is not None and not is_zero_number(code):
                failed = True
            duration = next(
                (
                    value
                    for value in (
                        metadata_fields.get("duration_seconds"),
                        fields.get("duration_seconds"),
                    )
                    if value is not None
                ),
                None,
            )
            if duration is not None:
                milliseconds = duration_milliseconds(duration)
        if isinstance(output, str):
            digits = first_exit_code_digits(output)
            if digits is not None and digits != "0":
                failed = True
    else:
        output = content_text(raw)
    shown = output if isinstance(output, str) else js_json(output)
    return clip(shown, MAX_OUT), failed, milliseconds


def is_parent_key(key: str) -> bool:
    folded = ascii_lower(key)
    return (
        len(folded) >= len("parentid")
        and folded.startswith("parent")
        and folded.endswith("id")
        and not any(char in LINE_TERMINATORS for char in folded[len("parent") : -2])
    )


def parent_in(value: object, depth: int, visited: set[int]) -> str | None:
    if not isinstance(value, (dict, list)) or depth > 4 or id(value) in visited:
        return None
    visited.add(id(value))
    entries = enumerate(value) if isinstance(value, list) else value.items()
    for key, item in entries:
        if isinstance(item, str) and isinstance(key, str) and is_parent_key(key):
            return item
        found = parent_in(item, depth + 1, visited)
        if found:
            return found
    return None


def parent_of(meta: object) -> str:
    properties = meta if isinstance(meta, dict) else {}
    return non_empty_text(
        parent_in(properties.get("source"), 0, set()),
        properties.get("parent_id"),
        properties.get("parent_thread_id"),
        properties.get("parent_session_id"),
    )


def split_on_line_terminators(text: str) -> list[str]:
    lines: list[str] = []
    start = 0
    for index, char in enumerate(text):
        if char in LINE_TERMINATORS:
            lines.append(text[start:index])
            start = index + 1
    lines.append(text[start:])
    return lines


def patch_file_in(line: str) -> str | None:
    starts = [
        (line.find(prefix), prefix) for prefix in PATCH_PREFIXES if prefix in line
    ]
    if not starts:
        return None
    position, prefix = min(starts)
    rest = line[position + len(prefix) :]
    return js_trim(rest) if rest else None


def patch_target(input_text: object) -> str:
    text = "" if input_text is None else js_string(input_text)
    files = [
        found
        for found in (patch_file_in(line) for line in split_on_line_terminators(text))
        if found is not None
    ]
    if not files:
        return target_of(input_text)
    shown = ", ".join(files[:2])
    if len(files) > 2:
        shown += f" (+{len(files) - 2})"
    return shown


def parse_arguments(raw: object) -> object:
    if not isinstance(raw, str):
        return raw
    try:
        return parse_json(raw)
    except ValueError:
        return raw


def path_for_targets(file_record: CodexFile) -> str | None:
    return file_record.cwd or None


def tool_use(
    ts: float,
    name: object,
    target: str,
    key: CallKey,
    done: bool = False,
) -> Event:
    return Event(
        ts=ts,
        kind="use",
        call_key=key,
        name=name if isinstance(name, str) else "",
        name_text=name if isinstance(name, str) else "tool",
        target=target,
        done=done,
    )


class CodexIngester:
    def __init__(self, file_record: CodexFile) -> None:
        self.file_record = file_record

    def event_message(self, ts: float, properties: dict[str, object]) -> None:
        message_type = properties.get("type")
        if message_type == "user_message":
            self.file_record.has_event_user = True
            text = clean_user_text(properties.get("message"))
            if text:
                self.file_record.events.append(
                    Event(ts=ts, kind="user", text=clip(text, 8000))
                )
        elif message_type == "token_count":
            self.token_count(properties)
        elif message_type == "turn_aborted":
            self.file_record.events.append(Event(ts=ts, kind="interrupt"))
        elif message_type == "task_complete":
            self.file_record.events.append(
                Event(
                    ts=ts,
                    kind="done",
                    returned=non_empty_text(properties.get("last_agent_message")),
                )
            )
        elif message_type == "error" or message_type == "stream_error":
            self.file_record.events.append(
                Event(ts=ts, kind="error", text=clip(properties.get("message"), 400))
            )
        else:
            if isinstance(message_type, str) and message_type.endswith(
                "approval_request"
            ):
                self.file_record.events.append(
                    Event(
                        ts=ts,
                        kind="approval",
                        call_key=call_key_of(properties.get("call_id")),
                    )
                )

    def token_count(self, properties: dict[str, object]) -> None:
        info = properties.get("info")
        total = info.get("total_token_usage") if isinstance(info, dict) else None
        if not isinstance(total, dict):
            return
        cached = token_count(total.get("cached_input_tokens"))
        written = token_count(total.get("cache_write_input_tokens"))
        self.file_record.usage = Usage(
            input=max(0, token_count(total.get("input_tokens")) - cached - written),
            output=token_count(total.get("output_tokens")),
            cache_read=cached,
            cache_write=written,
        )

    def message(self, ts: float, properties: dict[str, object]) -> None:
        content = properties.get("content")
        items = content if isinstance(content, list) else []
        text = content_text(
            [
                {
                    "type": "text",
                    "text": item.get("text") if isinstance(item, dict) else None,
                }
                for item in items
            ]
        )
        role = properties.get("role")
        if role == "assistant" and js_trim(text):
            self.file_record.events.append(
                Event(ts=ts, kind="say", text=clip(js_trim(text), 6000))
            )
        elif role == "user":
            cleaned = clean_user_text(text)
            if cleaned and not cleaned.startswith(INSTRUCTION_HEADERS):
                self.file_record.events.append(
                    Event(ts=ts, kind="ruser", text=clip(cleaned, 8000))
                )

    def response_item(self, ts: float, properties: dict[str, object]) -> None:
        item_type = properties.get("type")
        events = self.file_record.events
        cwd = path_for_targets(self.file_record)
        if item_type == "message":
            self.message(ts, properties)
        elif item_type == "function_call":
            arguments = parse_arguments(properties.get("arguments"))
            events.append(
                tool_use(
                    ts,
                    properties.get("name"),
                    target_of(arguments, cwd),
                    call_key_of(properties.get("call_id")),
                )
            )
        elif item_type == "custom_tool_call":
            name = properties.get("name")
            if name == "apply_patch":
                target = patch_target(properties.get("input"))
            else:
                target = target_of(properties.get("input"), cwd)
            events.append(
                tool_use(ts, name, target, call_key_of(properties.get("call_id")))
            )
        elif item_type == "local_shell_call":
            events.append(
                tool_use(
                    ts,
                    "shell",
                    target_of(properties.get("action"), cwd),
                    call_key_of(properties.get("call_id")),
                )
            )
        elif item_type == "web_search_call":
            identifier = properties.get("id")
            key = call_key_of(identifier) or f"ws{ts}"
            action = properties.get("action")
            query = action.get("query") if isinstance(action, dict) else None
            events.append(
                tool_use(
                    ts,
                    "web_search",
                    query if isinstance(query, str) else "",
                    key,
                    done=True,
                )
            )
        elif item_type in (
            "function_call_output",
            "custom_tool_call_output",
            "local_shell_call_output",
        ):
            out, failed, milliseconds = parse_output(properties.get("output"))
            events.append(
                Event(
                    ts=ts,
                    kind="result",
                    call_key=call_key_of(properties.get("call_id")),
                    out=out,
                    fail=failed,
                    ms=milliseconds,
                )
            )

    def session_meta(self, properties: dict[str, object]) -> None:
        identifier = properties.get("id")
        if isinstance(identifier, str) and identifier:
            self.file_record.sid = identifier
        self.file_record.cwd = non_empty_text(
            properties.get("cwd"), self.file_record.cwd
        )
        git = properties.get("git")
        branch = git.get("branch") if isinstance(git, dict) else None
        self.file_record.branch = non_empty_text(branch, self.file_record.branch)
        self.file_record.parent = parent_of(properties)
        source = properties.get("source")
        subagent = source.get("subagent") if isinstance(source, dict) else None
        subagent_name = subagent.get("name") if isinstance(subagent, dict) else None
        self.file_record.agent_name = non_empty_text(
            properties.get("agent_name"),
            properties.get("agent_role"),
            subagent_name,
            self.file_record.agent_name,
        )

    def ingest(self, record: object) -> None:
        if not isinstance(record, dict):
            return
        ts = timestamp_ms(record.get("timestamp"))
        payload = record.get("payload")
        properties = payload if isinstance(payload, dict) else {}
        self.file_record.note_timestamp(ts)
        record_type = record.get("type")
        if record_type == "session_meta":
            self.session_meta(properties)
        elif record_type == "turn_context":
            self.file_record.cwd = non_empty_text(
                properties.get("cwd"), self.file_record.cwd
            )
            self.file_record.model = non_empty_text(
                properties.get("model"), self.file_record.model
            )
        elif record_type == "event_msg":
            self.event_message(ts, properties)
        elif record_type == "response_item":
            self.response_item(ts, properties)
