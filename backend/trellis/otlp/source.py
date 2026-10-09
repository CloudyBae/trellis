from collections.abc import Callable
from functools import partial
from itertools import islice

from ..runtime.sources import Clock, Log, SessionSink
from ..sessions.constants import LIVE_MS, REFRESH_GRACE_MS
from ..sessions.models import Session
from .bodies import LogsBody, TracesBody
from .logs import build_logs
from .records import LogState, TraceState
from .staging import LogStager, StagedLogs, StagedTrace, TraceStager
from .trace import build_trace

MAX_SPANS = 5000
MAX_LOGS = 5000


class OtlpSource:
    def __init__(
        self,
        *,
        since_ms: float,
        store: SessionSink,
        clock: Clock,
        log: Log | None = None,
    ) -> None:
        self.since_ms = since_ms
        self.store = store
        self.clock = clock
        self.log = log
        self.traces: dict[str, TraceState] = {}
        self.logs: dict[str, LogState] = {}

    def accept_traces(self, body: TracesBody) -> int:
        staged = TraceStager(self.log).stage(body)
        touched = [self.commit_trace(key, batch) for key, batch in staged.items()]
        for state in touched:
            self.put(partial(build_trace, state, self.clock()))
        return sum(len(batch.spans) for batch in staged.values())

    def accept_logs(self, body: LogsBody) -> int:
        staged = LogStager(self.log, self.clock).stage(body)
        touched = [self.commit_logs(key, batch) for key, batch in staged.items()]
        for state in touched:
            self.put(partial(build_logs, state, self.clock()))
        return sum(len(batch.records) for batch in staged.values())

    def commit_trace(self, key: str, batch: StagedTrace) -> TraceState:
        state = self.traces.get(key)
        if state is None:
            state = TraceState(key=key, source=batch.source)
            self.traces[key] = state
        state.spans.update({span.id: span for span in batch.spans})
        state.last_ts = max(state.last_ts, batch.last_ts)
        state.received_at = self.clock()
        for oldest in list(islice(state.spans, max(0, len(state.spans) - MAX_SPANS))):
            del state.spans[oldest]
        return state

    def commit_logs(self, key: str, batch: StagedLogs) -> LogState:
        state = self.logs.get(key)
        if state is None:
            state = LogState(key=key, source=batch.source)
            self.logs[key] = state
        state.records.extend(batch.records)
        state.last_ts = max(state.last_ts, batch.last_ts)
        state.received_at = self.clock()
        del state.records[: max(0, len(state.records) - MAX_LOGS)]
        return state

    def put(self, build: Callable[[], Session]) -> None:
        try:
            self.store.put(build())
        except Exception as error:
            if self.log:
                self.log(f"otlp: {type(error).__name__}")

    def evict(self) -> None:
        cutoff = self.clock() - self.since_ms
        for key, trace_state in list(self.traces.items()):
            if trace_state.received_at < cutoff:
                del self.traces[key]
                self.store.remove("otel:" + key)
        for key, log_state in list(self.logs.items()):
            if log_state.received_at < cutoff:
                del self.logs[key]
                self.store.remove("otel-log:" + key)

    def refresh(self) -> None:
        self.evict()
        now = self.clock()
        for trace_state in list(self.traces.values()):
            if now - trace_state.last_ts < LIVE_MS + REFRESH_GRACE_MS:
                self.put(partial(build_trace, trace_state, now))
        for log_state in list(self.logs.values()):
            if now - log_state.last_ts < LIVE_MS + REFRESH_GRACE_MS:
                self.put(partial(build_logs, log_state, now))
