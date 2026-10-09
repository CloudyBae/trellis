from dataclasses import dataclass, field

from pydantic import BaseModel, ConfigDict, field_validator

from ..records import BaseEvent, BaseTranscriptFile


class ClaudeHookPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    session_id: str | None = None
    transcript_path: str | None = None
    hook_event_name: str | None = None
    notification_type: str | None = None
    message: str | None = None
    tool_name: str | None = None
    agent_id: str | None = None

    @field_validator(
        "session_id",
        "transcript_path",
        "hook_event_name",
        "notification_type",
        "message",
        "tool_name",
        "agent_id",
        mode="before",
    )
    @classmethod
    def drop_non_string(cls, value: object) -> str | None:
        return value if isinstance(value, str) else None


@dataclass
class Spawn:
    prompt: str
    description: str | None
    subagent_type: str | None
    background: bool


@dataclass
class Event(BaseEvent):
    id: str | None = None
    target: str | None = None
    spawn: Spawn | None = None


class TranscriptFile(BaseTranscriptFile[Event]):
    def __init__(self, file: str) -> None:
        super().__init__(file)
        self.cwd = ""
        self.branch = ""
        self.title = ""
        self.first_prompt = ""
        self.model = ""
        self.usage_by_message: dict[str, tuple[int, int, int, int]] = {}

    def reset(self) -> None:
        super().reset()
        self.title = self.first_prompt = ""
        self.usage_by_message = {}


class SubagentFile(TranscriptFile):
    def __init__(self, file: str, agent_id: str, meta_file: str) -> None:
        super().__init__(file)
        self.agent_id = agent_id
        self.meta_file = meta_file
        self.meta: object = None
        self.meta_mtime = 0.0


@dataclass
class Blocked:
    at: float
    message: str
    tool: str | None
    agent_id: str | None


@dataclass
class HookState:
    seen: bool = False
    blocked: Blocked | None = None
    stopped_at: float = 0.0
    last_at: float = 0.0


@dataclass
class SessionState:
    sid: str
    main_path: str
    dir: str
    main: TranscriptFile
    subs: dict[str, SubagentFile] = field(default_factory=dict)
    hook: HookState = field(default_factory=HookState)
    ended: bool = False
    dirty: bool = True


@dataclass
class SpawnRecord:
    file: TranscriptFile
    event: Event


@dataclass
class Node:
    file: TranscriptFile
    key: str
    start: float
    spawn: SpawnRecord | None = None
    parent_file: TranscriptFile | None = None
    id: int = 0


@dataclass
class BuildContext:
    t0: float
    cwd: str
    live: bool
    last_ts: float
    results: dict[str | None, Event]
    spawned_ids: set[str | None]
    id_of_file: dict[TranscriptFile, int]
