from dataclasses import dataclass, field


@dataclass(eq=False)
class SpanRecord:
    id: str
    parent: str
    name: str
    attributes: dict[str, object]
    start: int
    end: int
    error: bool
    status: str
    is_open: bool = False


@dataclass(eq=False)
class TraceState:
    key: str
    source: str
    spans: dict[str, SpanRecord] = field(default_factory=dict)
    last_ts: float = 0.0
    received_at: float = 0.0


@dataclass
class LogEntry:
    ts: float
    event: str
    attributes: dict[str, object]


@dataclass(eq=False)
class LogState:
    key: str
    source: str
    records: list[LogEntry] = field(default_factory=list)
    last_ts: float = 0.0
    received_at: float = 0.0
