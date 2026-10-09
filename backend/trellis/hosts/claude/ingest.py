from ...sessions.text import clean_user_text, content_text
from ...util.javascript import clip, js_trim
from ...util.limits import MAX_OUT
from ...util.targets import target_of
from ...util.tokens import token_count
from ...util.timestamps import timestamp_ms
from .records import Event, Spawn, TranscriptFile
from .values import string_or_empty, string_or_none

SPAWN_TOOLS = ("Agent", "Task")
INTERRUPT_PREFIX = "[Request interrupted by user"


class ClaudeIngester:
    def __init__(self, file: TranscriptFile, is_main: bool) -> None:
        self.file = file
        self.is_main = is_main

    def ingest(self, record: object) -> None:
        if not isinstance(record, dict):
            return
        if self.is_main and record.get("isSidechain"):
            return
        ts = timestamp_ms(record.get("timestamp"))
        cwd = string_or_empty(record.get("cwd"))
        if cwd:
            self.file.cwd = cwd
        branch = string_or_empty(record.get("gitBranch"))
        if branch:
            self.file.branch = branch
        self.file.note_timestamp(ts)
        kind = record.get("type")
        if kind == "summary":
            summary = string_or_empty(record.get("summary"))
            if summary:
                self.file.title = summary
        elif isinstance(kind, str) and "title" in kind:
            self.file.title = (
                string_or_empty(record.get("customTitle"))
                or string_or_empty(record.get("aiTitle"))
                or string_or_empty(record.get("title"))
                or self.file.title
            )
        message = record.get("message")
        content = message.get("content") if isinstance(message, dict) else None
        if kind == "assistant" and isinstance(message, dict):
            model = string_or_empty(message.get("model"))
            if model and not model.startswith("<"):
                self.file.model = model
            self.note_usage(record, message)
        if kind == "user":
            self.user(record, content, ts)
        elif kind == "assistant" and isinstance(content, list):
            self.assistant(record, content, ts)

    def note_usage(self, record: dict[str, object], message: dict[str, object]) -> None:
        usage = message.get("usage")
        if not isinstance(usage, dict):
            return
        key = string_or_empty(message.get("id")) or string_or_empty(record.get("uuid"))
        if not key:
            return
        self.file.usage_by_message[key] = (
            token_count(usage.get("input_tokens")),
            token_count(usage.get("output_tokens")),
            token_count(usage.get("cache_read_input_tokens")),
            token_count(usage.get("cache_creation_input_tokens")),
        )

    def user(self, record: dict[str, object], content: object, ts: float) -> None:
        texts: list[str] = []
        if isinstance(content, str):
            texts.append(content)
        elif isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                block_kind = block.get("type")
                if block_kind == "tool_result":
                    self.file.events.append(
                        Event(
                            ts=ts,
                            kind="result",
                            id=string_or_none(block.get("tool_use_id")),
                            out=clip(content_text(block.get("content")), MAX_OUT),
                            fail=bool(block.get("is_error")),
                        )
                    )
                elif block_kind == "text":
                    text = block.get("text")
                    if isinstance(text, str):
                        texts.append(text)
        if record.get("isMeta") or not texts:
            return
        raw = "\n".join(texts)
        if js_trim(raw).startswith(INTERRUPT_PREFIX):
            self.file.events.append(Event(ts=ts, kind="interrupt"))
            return
        text = clean_user_text(raw)
        if not text:
            return
        if not self.file.first_prompt:
            self.file.first_prompt = text
        self.file.events.append(Event(ts=ts, kind="user", text=clip(text, 8000)))

    def assistant(
        self, record: dict[str, object], content: list[object], ts: float
    ) -> None:
        if record.get("isApiErrorMessage"):
            self.file.events.append(
                Event(ts=ts, kind="error", text=clip(content_text(content), 400))
            )
            return
        for block in content:
            if not isinstance(block, dict):
                continue
            block_kind = block.get("type")
            if block_kind == "text":
                text = block.get("text")
                if isinstance(text, str) and js_trim(text):
                    self.file.events.append(
                        Event(ts=ts, kind="say", text=clip(js_trim(text), 6000))
                    )
            elif block_kind == "tool_use":
                self.tool_use(block, ts)

    def tool_use(self, block: dict[str, object], ts: float) -> None:
        tool_input = block.get("input")
        if not tool_input:
            tool_input = {}
        properties = tool_input if isinstance(tool_input, dict) else {}
        name = block.get("name")
        tool_id = string_or_none(block.get("id"))
        if name in SPAWN_TOOLS:
            spawn = Spawn(
                prompt=clip(properties.get("prompt"), 12000),
                description=string_or_none(properties.get("description")),
                subagent_type=string_or_none(properties.get("subagent_type")),
                background=bool(properties.get("run_in_background")),
            )
            self.file.events.append(
                Event(
                    ts=ts,
                    kind="use",
                    id=tool_id,
                    name=string_or_empty(name),
                    spawn=spawn,
                )
            )
        elif name == "SubagentHandback":
            message = properties.get("message")
            shown = message if message is not None else content_text(tool_input)
            self.file.events.append(
                Event(ts=ts, kind="handback", text=clip(shown, 20000))
            )
        else:
            self.file.events.append(
                Event(
                    ts=ts,
                    kind="use",
                    id=tool_id,
                    name=string_or_empty(name),
                    target=target_of(tool_input, self.file.cwd or None),
                )
            )
