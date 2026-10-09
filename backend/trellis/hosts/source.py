from collections.abc import Sequence

from ..runtime.sources import Clock, Log, SessionSink


class HostSource:
    def __init__(
        self,
        *,
        roots: Sequence[str],
        since_ms: float,
        store: SessionSink,
        clock: Clock,
        log: Log | None = None,
    ) -> None:
        self.roots = list(roots)
        self.since_ms = since_ms
        self.store = store
        self.log = log
        self.clock = clock
