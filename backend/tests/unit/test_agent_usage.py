from tests.support.otlp_replay import BASE_MS, make_replay, nano, string_attributes
from trellis.hosts.claude.ingest import ClaudeIngester
from trellis.hosts.claude.records import TranscriptFile
from trellis.hosts.codex.ingest import CodexIngester
from trellis.hosts.codex.records import CodexFile
from trellis.hosts.copilot.build import SessionBuilder
from trellis.util.tokens import token_count


def claude_record(message_id: str, output_tokens: int) -> dict:
    return {
        "type": "assistant",
        "timestamp": "2026-01-01T00:00:00.000Z",
        "message": {
            "id": message_id,
            "content": [{"type": "text", "text": "hi"}],
            "usage": {
                "input_tokens": 10,
                "output_tokens": output_tokens,
                "cache_read_input_tokens": 100,
                "cache_creation_input_tokens": 5,
            },
        },
    }


def test_claude_counts_a_repeated_message_once_using_its_latest_usage():
    transcript = TranscriptFile("main.jsonl")
    ingester = ClaudeIngester(transcript, is_main=True)
    ingester.ingest(claude_record("msg_1", 3))
    ingester.ingest(claude_record("msg_1", 40))
    ingester.ingest(claude_record("msg_2", 7))
    totals = [sum(column) for column in zip(*transcript.usage_by_message.values())]
    assert totals == [20, 47, 200, 10]


def test_codex_reports_fresh_input_separately_from_cached_input():
    codex_file = CodexFile("rollout.jsonl")
    ingester = CodexIngester(codex_file)
    for input_tokens, output_tokens in ((1000, 10), (3000, 30)):
        ingester.ingest(
            {
                "type": "event_msg",
                "timestamp": "2026-01-01T00:00:00.000Z",
                "payload": {
                    "type": "token_count",
                    "info": {
                        "total_token_usage": {
                            "input_tokens": input_tokens,
                            "cached_input_tokens": 2000 if input_tokens > 1000 else 0,
                            "cache_write_input_tokens": 0,
                            "output_tokens": output_tokens,
                        }
                    },
                },
            }
        )
    assert codex_file.usage is not None
    assert codex_file.usage.model_dump() == {
        "input": 1000,
        "output": 30,
        "cache_read": 2000,
        "cache_write": 0,
    }


def test_copilot_sums_request_usage_onto_the_root_and_omits_it_when_absent():
    data = {
        "requests": [
            {
                "timestamp": 1000,
                "message": {"text": "a"},
                "usage": {"promptTokens": 100, "completionTokens": 5},
            },
            {
                "timestamp": 2000,
                "message": {"text": "b"},
                "usage": {"promptTokens": 50, "completionTokens": 2},
            },
        ]
    }
    agents = SessionBuilder(data, "/tmp/chat.json", "repo", 5000).build_agents()
    assert agents[0].usage is not None
    assert (agents[0].usage.input, agents[0].usage.output) == (150, 7)
    bare = {"requests": [{"timestamp": 1000, "message": {"text": "a"}}]}
    agents = SessionBuilder(bare, "/tmp/chat.json", "repo", 5000).build_agents()
    assert agents[0].usage is None


def test_trace_agents_sum_the_usage_of_their_chat_spans():
    replay = make_replay()
    replay.clock["now"] = BASE_MS + 2000
    spans = []
    for span_id, parent, operation, tokens in (
        ("root", None, "invoke_agent", {}),
        (
            "chat1",
            "root",
            "chat",
            {"gen_ai.usage.input_tokens": "100", "gen_ai.usage.output_tokens": "10"},
        ),
        (
            "chat2",
            "root",
            "chat",
            {
                "gen_ai.usage.input_tokens": "50",
                "gen_ai.usage.output_tokens": "5",
                "gen_ai.usage.cache_read.input_tokens": "30",
            },
        ),
    ):
        span = {
            "traceId": "T-usage",
            "spanId": span_id,
            "name": operation,
            "startTimeUnixNano": nano(BASE_MS),
            "endTimeUnixNano": nano(BASE_MS + 1000),
            "attributes": string_attributes(
                {
                    "gen_ai.operation.name": operation,
                    "gen_ai.conversation.id": "usage-case",
                    **tokens,
                }
            ),
        }
        if parent:
            span["parentSpanId"] = parent
        spans.append(span)
    replay.accept(
        "traces",
        {
            "resourceSpans": [
                {
                    "resource": {
                        "attributes": string_attributes({"service.name": "copilot"})
                    },
                    "scopeSpans": [{"spans": spans}],
                }
            ]
        },
    )
    session = replay.session("otel:usage-case")
    assert session is not None
    assert session["agents"][0]["usage"] == {
        "input": 150,
        "output": 15,
        "cacheRead": 30,
        "cacheWrite": 0,
    }


def test_token_count_accepts_numbers_and_digit_strings_only():
    assert token_count(12) == 12
    assert token_count("12") == 12
    assert token_count(-3) == 0
    assert token_count(True) == 0
    assert token_count("1e3") == 0
    assert token_count(None) == 0
