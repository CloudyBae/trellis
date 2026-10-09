from collections.abc import Callable
from typing import Protocol

from ..sessions.models import Session

Clock = Callable[[], float]
Log = Callable[[str], None]


class SessionSink(Protocol):
    def put(self, session: Session) -> None: ...

    def remove(self, session_id: str) -> None: ...


class Source(Protocol):
    def refresh(self) -> None: ...


class TranscriptSource(Source, Protocol):
    def scan(self) -> None: ...

    def poll(self) -> None: ...
