from dataclasses import dataclass
from typing import Generic, TypeVar

from .jsonl import JsonlTail


@dataclass
class BaseEvent:
    ts: float
    kind: str
    name: str = ""
    text: str = ""
    out: str = ""
    fail: bool = False


EventT = TypeVar("EventT", bound=BaseEvent)


class BaseTranscriptFile(Generic[EventT]):
    def __init__(self, file: str) -> None:
        self.tail = JsonlTail(file)
        self.file = file
        self.events: list[EventT] = []
        self.first_ts = 0.0
        self.last_ts = 0.0

    def reset(self) -> None:
        self.events = []
        self.first_ts = self.last_ts = 0.0

    def note_timestamp(self, timestamp: float) -> None:
        if timestamp:
            if not self.first_ts or timestamp < self.first_ts:
                self.first_ts = timestamp
            if timestamp > self.last_ts:
                self.last_ts = timestamp
