import json

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

EXACT_INTEGER_LIMIT = 2**53


class RejectedBody(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class OtlpModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel)


class AnyValue(OtlpModel):
    string_value: str | None = None
    int_value: int | None = None
    double_value: float | None = None
    bool_value: bool | None = None
    array_value: "ArrayValue | None" = None
    kvlist_value: "KeyValueList | None" = None

    def to_python(self) -> object:
        if self.string_value is not None:
            return self.string_value
        if self.int_value is not None:
            return self.int_value
        if self.double_value is not None:
            return self.double_value
        if self.bool_value is not None:
            return self.bool_value
        if self.array_value is not None:
            return [item.to_python() for item in self.array_value.values or []]
        if self.kvlist_value is not None:
            return attribute_map(self.kvlist_value.values)
        return None


class ArrayValue(OtlpModel):
    values: list[AnyValue] | None = None


class KeyValue(OtlpModel):
    key: str | None = None
    value: AnyValue | None = None


class KeyValueList(OtlpModel):
    values: list[KeyValue] | None = None


AnyValue.model_rebuild()


def attribute_map(items: list[KeyValue] | None) -> dict[str, object]:
    return {
        item.key: None if item.value is None else item.value.to_python()
        for item in items or []
        if item.key is not None
    }


class Resource(OtlpModel):
    attributes: list[KeyValue] | None = None


class Status(OtlpModel):
    code: int | str | None = None
    message: str | None = None


class Span(OtlpModel):
    trace_id: str | None = None
    span_id: str | None = None
    parent_span_id: str | None = None
    name: str | None = None
    start_time_unix_nano: int | None = None
    end_time_unix_nano: int | None = None
    attributes: list[KeyValue] | None = None
    status: Status | None = None


class ScopeSpans(OtlpModel):
    spans: list[object] | None = None


class ResourceSpans(OtlpModel):
    resource: Resource | None = None
    scope_spans: list[object] | None = None
    instrumentation_library_spans: list[object] | None = None


class TracesBody(OtlpModel):
    resource_spans: list[object] | None = None


class LogRecord(OtlpModel):
    time_unix_nano: int | None = None
    observed_time_unix_nano: int | None = None
    attributes: list[KeyValue] | None = None
    body: AnyValue | None = None


class ScopeLogs(OtlpModel):
    log_records: list[object] | None = None


class ResourceLogs(OtlpModel):
    resource: Resource | None = None
    scope_logs: list[object] | None = None


class LogsBody(OtlpModel):
    resource_logs: list[object] | None = None


def reject_constant(name: str) -> object:
    raise ValueError(name)


def parse_integer(literal: str) -> object:
    approximate = float(literal)
    if abs(approximate) < EXACT_INTEGER_LIMIT:
        return int(literal)
    return approximate


def parse_otlp_body(text: str) -> object:
    try:
        return json.loads(text, parse_constant=reject_constant, parse_int=parse_integer)
    except RecursionError as error:
        raise ValueError("nesting too deep") from error
