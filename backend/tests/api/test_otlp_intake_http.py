import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from tests.api.test_app import PORT, make_runtime
from tests.support.network import LOOPBACK
from trellis.api import intake
from trellis.api.app import create_app
from trellis.otlp.staging import LogStager
from trellis.runtime import runtime as runtime_module

MARKER = "SECRET-MARKER-9137"
HEADERS = {"host": f"{LOOPBACK}:{PORT}", "content-type": "application/json"}
NANOS = "1790596740000000000"


class RejectingPayload(BaseModel):
    required: int


def span(span_id: object, session: str = "conv") -> dict[str, object]:
    return {
        "traceId": f"T-{session}",
        "spanId": span_id,
        "name": "execute_tool shell",
        "startTimeUnixNano": NANOS,
        "endTimeUnixNano": NANOS,
        "attributes": [
            {"key": "gen_ai.operation.name", "value": {"stringValue": "execute_tool"}},
            {"key": "gen_ai.conversation.id", "value": {"stringValue": session}},
            {"key": "gen_ai.tool.name", "value": {"stringValue": f"tool-{span_id}"}},
        ],
    }


def log_record(name: str) -> dict[str, object]:
    return {
        "timeUnixNano": NANOS,
        "attributes": [
            {
                "key": "event.name",
                "value": {"stringValue": "claude_code.tool_result"},
            },
            {"key": "session.id", "value": {"stringValue": "retry"}},
            {"key": "tool_name", "value": {"stringValue": name}},
        ],
    }


class Harness:
    def __init__(self, tmp_path: Path) -> None:
        self.logs: list[str] = []
        self.runtime = make_runtime(tmp_path, self.logs)
        self.client = TestClient(
            create_app(runtime=self.runtime, port=PORT, host=LOOPBACK)
        )

    def post(self, path: str, body: object | None = None, raw: bytes | None = None):
        content = raw if raw is not None else json.dumps(body).encode("utf-8")
        return self.client.post(path, content=content, headers=HEADERS)

    def tool_names(self, session_id: str) -> list[str]:
        [session] = [
            session
            for session in self.client.get("/api/sessions", headers=HEADERS).json()
            if session["id"] == session_id
        ]
        return [turn["name"] for turn in session["agents"][0]["turns"]]


@pytest.fixture
def harness(tmp_path: Path):
    harness = Harness(tmp_path)
    with harness.client:
        yield harness


def test_a_batch_with_one_invalid_span_returns_200_and_stores_the_valid_spans(
    harness: Harness,
) -> None:
    body = {
        "resourceSpans": [
            {"scopeSpans": [{"spans": [span("a"), span([1, 2]), span("b")]}]}
        ]
    }
    response = harness.post("/v1/traces", body)
    assert (response.status_code, response.json()) == (200, {})
    assert sorted(harness.tool_names("otel:conv")) == ["tool-a", "tool-b"]
    assert harness.logs == ["otlp: ValidationError"]


@pytest.mark.parametrize(
    ("raw", "message"),
    [
        (b"{not json", "body is not valid JSON"),
        (b"null", "body must be a JSON object or array"),
        (b'{"resourceSpans": "x"}', "body does not match the expected shape"),
        (b'{"resourceSpans": {}}', "body does not match the expected shape"),
    ],
)
def test_client_faults_in_a_traces_body_return_400_with_the_reason(
    harness: Harness, raw: bytes, message: str
) -> None:
    response = harness.post("/v1/traces", raw=raw)
    assert (response.status_code, response.json()) == (400, {"error": message})


def test_a_logs_body_with_a_malformed_container_returns_400(harness: Harness) -> None:
    response = harness.post("/v1/logs", raw=b'{"resourceLogs": 5}')
    assert response.status_code == 400
    assert response.json() == {"error": "body does not match the expected shape"}


def test_an_oversize_body_returns_413_and_protobuf_returns_415(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(intake, "OTLP_LIMIT", 64)
    assert harness.post("/v1/traces", raw=b"{" + b" " * 100 + b"}").status_code == 413
    protobuf = harness.client.post(
        "/v1/traces",
        content=b"\x0a\x00",
        headers={**HEADERS, "content-type": "application/x-protobuf"},
    )
    assert protobuf.status_code == 415


def test_a_hook_body_that_fails_validation_returns_400(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(runtime_module, "ClaudeHookPayload", RejectingPayload)
    response = harness.post("/hooks/claude", {"hook_event_name": "Stop"})
    assert response.status_code == 400
    assert response.json() == {"error": "body does not match the expected shape"}


def test_a_server_fault_returns_500_leaves_state_alone_and_a_retry_stores_once(
    harness: Harness,
    monkeypatch: pytest.MonkeyPatch,
    capfd: pytest.CaptureFixture[str],
) -> None:
    body = {
        "resourceLogs": [
            {
                "scopeLogs": [
                    {
                        "logRecords": [
                            log_record("one"),
                            log_record("two"),
                            log_record("three"),
                        ]
                    }
                ]
            }
        ]
    }
    original = LogStager.stage_record
    staged_calls: list[object] = []

    def failing_on_second(self, staged, resource_attributes, record_raw):
        staged_calls.append(record_raw)
        if len(staged_calls) == 2:
            raise RuntimeError(MARKER)
        original(self, staged, resource_attributes, record_raw)

    otlp = harness.runtime.otlp
    logs_before, traces_before = dict(otlp.logs), dict(otlp.traces)
    monkeypatch.setattr(LogStager, "stage_record", failing_on_second)
    failed = harness.post("/v1/logs", body)
    assert (failed.status_code, failed.json()) == (500, {"error": "internal error"})
    assert len(staged_calls) == 2
    assert (otlp.logs, otlp.traces) == (logs_before, traces_before)
    assert harness.logs == ["intake failed: RuntimeError"]
    captured = capfd.readouterr()
    assert MARKER not in captured.out + captured.err
    assert MARKER not in failed.text
    monkeypatch.setattr(LogStager, "stage_record", original)
    assert harness.post("/v1/logs", body).status_code == 200
    assert harness.tool_names("otel-log:retry") == ["one", "two", "three"]
