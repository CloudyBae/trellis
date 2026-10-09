from trellis.hosts.claude.ingest import ClaudeIngester
from trellis.hosts.claude.records import TranscriptFile
from trellis.hosts.codex.ingest import CodexIngester
from trellis.hosts.codex.records import CodexFile
from trellis.hosts.copilot.build import SessionBuilder
from tests.support.otlp_replay import BASE_MS, make_replay, nano, string_attributes
from trellis.otlp.attributes import model_of


def assistant_record(model: str) -> dict:
    return {
        "type": "assistant",
        "timestamp": "2026-01-01T00:00:00.000Z",
        "message": {"model": model, "content": [{"type": "text", "text": "hi"}]},
    }


def test_claude_keeps_the_latest_real_model_and_ignores_synthetic_ones():
    transcript = TranscriptFile("main.jsonl")
    ingester = ClaudeIngester(transcript, is_main=True)
    ingester.ingest(assistant_record("claude-sonnet-5-5"))
    ingester.ingest(assistant_record("claude-opus-5-5"))
    ingester.ingest(assistant_record("<synthetic>"))
    assert transcript.model == "claude-opus-5-5"


def test_codex_reads_the_model_from_turn_context():
    codex_file = CodexFile("rollout.jsonl")
    ingester = CodexIngester(codex_file)
    ingester.ingest(
        {
            "type": "turn_context",
            "timestamp": "2026-01-01T00:00:00.000Z",
            "payload": {"model": "gpt-5.5"},
        }
    )
    ingester.ingest(
        {
            "type": "turn_context",
            "timestamp": "2026-01-01T00:00:01.000Z",
            "payload": {"cwd": "/work"},
        }
    )
    assert codex_file.model == "gpt-5.5"


def test_copilot_root_reports_the_latest_request_model():
    data = {
        "requests": [
            {"timestamp": 1000, "message": {"text": "a"}, "modelId": "copilot/gpt-4.1"},
            {"timestamp": 2000, "message": {"text": "b"}, "modelId": "copilot/o4-mini"},
        ]
    }
    agents = SessionBuilder(data, "/tmp/chat.json", "repo", 5000).build_agents()
    assert agents[0].model == "copilot/o4-mini"


def test_a_missing_model_stays_unset_in_the_serialized_agent():
    data = {"requests": [{"timestamp": 1000, "message": {"text": "a"}}]}
    agents = SessionBuilder(data, "/tmp/chat.json", "repo", 5000).build_agents()
    assert agents[0].model is None
    assert "model" not in agents[0].model_dump(by_alias=True, exclude_unset=True)


def test_otlp_prefers_the_response_model_over_the_request_model():
    assert (
        model_of(
            {"gen_ai.request.model": "gpt-4o", "gen_ai.response.model": "gpt-4o-2024"}
        )
        == "gpt-4o-2024"
    )
    assert model_of({"gen_ai.request.model": "gpt-4o"}) == "gpt-4o"
    assert model_of({"unrelated": "x"}) == ""


def span_body(spans: list[dict]) -> dict:
    return {
        "resourceSpans": [
            {
                "resource": {
                    "attributes": string_attributes({"service.name": "copilot"})
                },
                "scopeSpans": [{"spans": spans}],
            }
        ]
    }


def otlp_span(span_id: str, parent: str | None, operation: str, **attributes: str):
    span = {
        "traceId": "T-model",
        "spanId": span_id,
        "name": operation,
        "startTimeUnixNano": nano(BASE_MS),
        "endTimeUnixNano": nano(BASE_MS + 1000),
        "attributes": string_attributes(
            {
                "gen_ai.operation.name": operation,
                "gen_ai.conversation.id": "model-case",
                **attributes,
            }
        ),
    }
    if parent:
        span["parentSpanId"] = parent
    return span


def test_trace_agents_take_the_model_from_their_chat_spans():
    replay = make_replay()
    replay.clock["now"] = BASE_MS + 2000
    replay.accept(
        "traces",
        span_body(
            [
                otlp_span("root", None, "invoke_agent"),
                otlp_span(
                    "sub", "root", "invoke_agent", **{"gen_ai.agent.name": "Sub"}
                ),
                otlp_span(
                    "chat1", "root", "chat", **{"gen_ai.request.model": "gpt-4o"}
                ),
                otlp_span(
                    "chat2", "sub", "chat", **{"gen_ai.response.model": "o4-mini"}
                ),
            ]
        ),
    )
    session = replay.session("otel:model-case")
    assert session is not None
    assert [agent.get("model") for agent in session["agents"]] == ["gpt-4o", "o4-mini"]
