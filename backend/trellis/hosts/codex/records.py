from dataclasses import dataclass, field

from ...sessions.models import Turn, Usage
from ..records import BaseEvent, BaseTranscriptFile

CallKey = str | None


@dataclass
class Event(BaseEvent):
    call_key: CallKey = None
    name_text: str = ""
    returned: str = ""
    target: str = ""
    done: bool = False
    ms: float | None = None


class CodexFile(BaseTranscriptFile[Event]):
    def __init__(self, file: str) -> None:
        super().__init__(file)
        self.cwd = ""
        self.branch = ""
        self.sid = ""
        self.agent_name = ""
        self.parent = ""
        self.has_event_user = False
        self.model = ""
        self.usage: Usage | None = None


@dataclass
class TreeNode:
    file: CodexFile
    parent: CodexFile | None
    id: int = 0


@dataclass
class AgentTurns:
    turns: list[Turn] = field(default_factory=list)
    uses: list[Event | None] = field(default_factory=list)
    task: str = ""
    last_say: Event | None = None
    last_error: Event | None = None
    done: Event | None = None
