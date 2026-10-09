from dataclasses import dataclass, field
from typing import TypeVar

from pydantic import BaseModel

from ..runtime.sources import Clock, Log
from ..util.timestamps import parse_timestamp_ms
from .attributes import attr_text, session_key, source_of
from .bodies import (
    LogRecord,
    LogsBody,
    ResourceLogs,
    ResourceSpans,
    ScopeLogs,
    ScopeSpans,
    Span,
    TracesBody,
    attribute_map,
)
from .records import LogEntry, SpanRecord
from .times import nano_to_ms

LOG_EVENT_SUFFIXES = (
    ".user_prompt",
    ".tool_result",
    ".tool_decision",
    ".api_error",
    ".api_request",
)
Model = TypeVar("Model", bound=BaseModel)
ERROR_STATUS_CODES = (2, "STATUS_CODE_ERROR")


@dataclass
class StagedTrace:
    source: str
    spans: list[SpanRecord] = field(default_factory=list)
    last_ts: int = 0


@dataclass
class StagedLogs:
    source: str
    records: list[LogEntry] = field(default_factory=list)
    last_ts: float = 0.0


class ItemReader:
    def __init__(self, log: Log | None) -> None:
        self.log = log

    def read(self, model: type[Model], raw: object) -> Model | None:
        try:
            return model.model_validate(raw)
        except ValueError as error:
            self.skipped(error)
            return None

    def skipped(self, error: Exception) -> None:
        if self.log:
            self.log(f"otlp: {type(error).__name__}")


class TraceStager:
    def __init__(self, log: Log | None) -> None:
        self.reader = ItemReader(log)

    def stage(self, body: TracesBody) -> dict[str, StagedTrace]:
        staged: dict[str, StagedTrace] = {}
        for resource_raw in body.resource_spans or []:
            resource = self.reader.read(ResourceSpans, resource_raw)
            if resource is None:
                continue
            attributes = attribute_map(
                resource.resource.attributes if resource.resource else None
            )
            scopes = resource.scope_spans or resource.instrumentation_library_spans
            for scope_raw in scopes or []:
                scope = self.reader.read(ScopeSpans, scope_raw)
                if scope is None:
                    continue
                for span_raw in scope.spans or []:
                    self.stage_span(staged, attributes, span_raw)
        return staged

    def stage_span(
        self,
        staged: dict[str, StagedTrace],
        resource_attributes: dict[str, object],
        span_raw: object,
    ) -> None:
        span = self.reader.read(Span, span_raw)
        if span is None:
            return
        try:
            key, record = self.record_of(span, resource_attributes)
        except ValueError as error:
            self.reader.skipped(error)
            return
        batch = staged.setdefault(
            key,
            StagedTrace(
                source=source_of(attr_text(resource_attributes, "service.name"))
            ),
        )
        batch.spans.append(record)
        batch.last_ts = max(batch.last_ts, record.end or record.start)

    @staticmethod
    def record_of(
        span: Span, resource_attributes: dict[str, object]
    ) -> tuple[str, SpanRecord]:
        attributes = {**resource_attributes, **attribute_map(span.attributes)}
        key = session_key(attributes, span.trace_id or "")
        if not key:
            raise ValueError("span has no session key")
        status = span.status
        return key, SpanRecord(
            id=span.span_id or "",
            parent=span.parent_span_id or "",
            name=span.name or "",
            attributes=attributes,
            start=nano_to_ms(span.start_time_unix_nano),
            end=nano_to_ms(span.end_time_unix_nano),
            error=status is not None and status.code in ERROR_STATUS_CODES,
            status=(status.message or "") if status else "",
        )


class LogStager:
    def __init__(self, log: Log | None, clock: Clock) -> None:
        self.reader = ItemReader(log)
        self.clock = clock

    def stage(self, body: LogsBody) -> dict[str, StagedLogs]:
        staged: dict[str, StagedLogs] = {}
        for resource_raw in body.resource_logs or []:
            resource = self.reader.read(ResourceLogs, resource_raw)
            if resource is None:
                continue
            attributes = attribute_map(
                resource.resource.attributes if resource.resource else None
            )
            for scope_raw in resource.scope_logs or []:
                scope = self.reader.read(ScopeLogs, scope_raw)
                if scope is None:
                    continue
                for record_raw in scope.log_records or []:
                    self.stage_record(staged, attributes, record_raw)
        return staged

    def stage_record(
        self,
        staged: dict[str, StagedLogs],
        resource_attributes: dict[str, object],
        record_raw: object,
    ) -> None:
        record = self.reader.read(LogRecord, record_raw)
        if record is None:
            return
        attributes = {**resource_attributes, **attribute_map(record.attributes)}
        event = attr_text(attributes, "event.name") or self.event_from_body(record)
        key = session_key(attributes, "")
        if not key or not event.endswith(LOG_EVENT_SUFFIXES):
            return
        service_name = attr_text(resource_attributes, "service.name")
        batch = staged.setdefault(
            key, StagedLogs(source=source_of(service_name or event.split(".")[0]))
        )
        entry = LogEntry(
            ts=self.timestamp_of(record, attributes),
            event=event.split(".")[-1],
            attributes=attributes,
        )
        batch.records.append(entry)
        batch.last_ts = max(batch.last_ts, entry.ts)

    @staticmethod
    def event_from_body(record: LogRecord) -> str:
        body_value = None if record.body is None else record.body.to_python()
        return body_value if isinstance(body_value, str) else ""

    def timestamp_of(self, record: LogRecord, attributes: dict[str, object]) -> float:
        timestamp = nano_to_ms(record.time_unix_nano or record.observed_time_unix_nano)
        if timestamp:
            return timestamp
        stamp = attributes.get("event.timestamp")
        parsed = parse_timestamp_ms(stamp) if isinstance(stamp, str) else None
        return parsed or self.clock()
