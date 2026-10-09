import json

import pytest
from pydantic import BaseModel

from tests.support.otlp_replay import (
    BASE_MS,
    SECOND,
    TESTS_DIRECTORY,
    final_session,
    Replay,
    final_sessions,
    make_replay,
    nano,
    play,
    present,
    string_attributes,
    tool_turns,
)
from trellis.otlp import source as otlp_source
from trellis.otlp.bodies import LogsBody, TracesBody, parse_otlp_body
from trellis.otlp.records import TraceState
from trellis.otlp.staging import LogStager
from trellis.util.javascript import js_string


def test_seconds_round_half_up_at_every_half_boundary():
    session = final_session("seconds_rounding", "otel:sr")
    rows = {name: turn["at"] for name, turn in tool_turns(session["agents"][0]).items()}
    assert rows == {
        "zero": 0,
        "at-500": 1,
        "at-999": 1,
        "at-1499": 1,
        "at-1500": 2,
        "at-2499": 2,
        "at-2500": 3,
        "at-3500": 4,
        "at-4500": 5,
        "at-5499": 5,
    }
    assert (session["agents"][0]["start"], session["agents"][0]["end"]) == (1, 3)
    assert [
        turn["at"] for turn in session["agents"][0]["turns"] if turn["kind"] == "msg"
    ] == [7]
    assert session["endAt"] == 7


def test_negative_nano_strings_truncate_toward_zero():
    session = final_session("nano_truncation", "otel:nt-trunc")
    assert session["t0"] == -1499
    assert [turn["at"] for turn in session["agents"][0]["turns"]] == [0, 2, 4]


def test_nano_strings_read_as_decimal_integers_and_other_forms_skip_the_span():
    session = final_session("nano_forms", "otel:nf")
    [agent] = session["agents"]
    starts = {turn["name"]: turn["at"] for turn in agent["turns"]}
    assert [starts[f"start-form-{index}"] for index in (1, 5, 6)] == [0, 4, 5]
    small = final_session("nano_forms", "otel:nf2")
    assert small["t0"] == 0
    assert [turn["at"] for turn in small["agents"][0]["turns"]] == [0, 4, 5, 6, 7]
    _, outputs = play("nano_forms")
    assert (outputs[0]["returned"], outputs[0]["logged"]) == (7, 10)


def test_a_nano_number_beyond_two_to_the_53_is_already_rounded_like_javascript():
    sessions = final_sessions("nano_large_integers")
    assert present(sessions, "otel:big")["t0"] == 1790506800000
    assert present(sessions, "otel-log:big")["t0"] == 1790506800000


def test_parse_otlp_body_keeps_large_integer_literals():
    scenario = json.loads(
        (TESTS_DIRECTORY / "cases" / "large_integers.json").read_text("utf-8")
    )
    for literal in scenario["literals"]:
        value = parse_otlp_body(literal["text"])
        assert js_string(value) == literal["string"], literal["text"]
        assert isinstance(value, (int, float))
        if literal["isInteger"] and abs(value) >= 2**53:
            assert isinstance(value, float)


def test_parse_otlp_body_turns_integer_literals_past_two_to_the_53_into_floats():
    parsed = parse_otlp_body("[1790506799999999999, 9007199254740993, 12, -12]")
    assert isinstance(parsed, list)
    assert [type(item) for item in parsed] == [float, float, int, int]
    assert parsed[0] == 1790506800000000000


@pytest.mark.parametrize("text", ["[NaN]", "[Infinity]", "[-Infinity]", "", "{"])
def test_parse_otlp_body_rejects_what_json_parse_rejects(text: str):
    with pytest.raises(ValueError):
        parse_otlp_body(text)


class Rejecting(BaseModel):
    required: int


def span_entry(span_id: object, session: str = "conv") -> dict[str, object]:
    return {
        "traceId": f"T-{session}",
        "spanId": span_id,
        "name": "execute_tool shell",
        "startTimeUnixNano": nano(BASE_MS),
        "endTimeUnixNano": nano(BASE_MS + 10),
        "attributes": string_attributes(
            {
                "gen_ai.operation.name": "execute_tool",
                "gen_ai.conversation.id": session,
                "gen_ai.tool.name": f"tool-{span_id}",
            }
        ),
    }


def traces_body(resources: list[object]) -> dict[str, object]:
    return {"resourceSpans": resources}


def resource_of(scopes: list[object]) -> dict[str, object]:
    return {"scopeSpans": scopes}


def tool_names(replay: Replay, session_id: str) -> list[str]:
    session = replay.session(session_id)
    assert session is not None
    return [turn["name"] for turn in session["agents"][0]["turns"]]


def test_a_malformed_span_is_skipped_and_the_valid_siblings_are_stored():
    replay = make_replay()
    replay.clock["now"] = BASE_MS + SECOND
    spans = [span_entry("a"), span_entry(["not", "a", "string"]), span_entry("b")]
    body = traces_body([resource_of([{"spans": spans}])])
    assert replay.accept("traces", body) == 2
    assert replay.logged == ["otlp: ValidationError"]
    assert sorted(tool_names(replay, "otel:conv")) == ["tool-a", "tool-b"]


def test_malformed_resource_and_scope_entries_leave_the_valid_ones_intact():
    replay = make_replay()
    replay.clock["now"] = BASE_MS + SECOND
    body = traces_body(
        [
            "not a resource",
            resource_of(
                [
                    {"spans": [span_entry("a")]},
                    "not a scope",
                    {"spans": "not a list"},
                    {"spans": [span_entry("b")]},
                ]
            ),
            {"resource": {"attributes": "bad"}, "scopeSpans": []},
            {"instrumentationLibrarySpans": [{"spans": [span_entry("c")]}]},
        ]
    )
    assert replay.accept("traces", body) == 3
    assert replay.logged == ["otlp: ValidationError"] * 4
    assert sorted(tool_names(replay, "otel:conv")) == ["tool-a", "tool-b", "tool-c"]


def test_a_skipped_item_is_logged_by_exception_type_and_never_by_content():
    replay = make_replay()
    replay.clock["now"] = BASE_MS + SECOND
    body = traces_body(
        [resource_of([{"spans": [span_entry(["SECRET-SPAN-ID"]), span_entry("ok")]}])]
    )
    assert replay.accept("traces", body) == 1
    assert replay.logged == ["otlp: ValidationError"]


def test_a_span_without_a_name_or_ids_still_builds_a_session():
    replay = make_replay()
    replay.clock["now"] = BASE_MS + SECOND
    span = {
        "traceId": "T-bare",
        "startTimeUnixNano": nano(BASE_MS),
        "attributes": string_attributes({"gen_ai.operation.name": "execute_tool"}),
    }
    assert replay.accept("traces", traces_body([resource_of([{"spans": [span]}])])) == 1
    assert tool_names(replay, "otel:T-bare") == [""]
    assert replay.logged == []


def test_a_span_with_no_session_key_is_skipped():
    replay = make_replay()
    body = traces_body([resource_of([{"spans": [{"spanId": "x"}]}])])
    assert replay.accept("traces", body) == 0
    assert replay.logged == ["otlp: ValueError"]
    assert replay.source.traces == {}


def test_a_session_that_fails_to_build_is_logged_and_the_others_are_stored(
    monkeypatch: pytest.MonkeyPatch,
):
    replay = make_replay()
    replay.clock["now"] = BASE_MS + SECOND
    original = otlp_source.build_trace

    def failing_for_one(state: TraceState, now: float):
        if state.key == "broken":
            raise Rejecting.model_validate({})
        return original(state, now)

    monkeypatch.setattr(otlp_source, "build_trace", failing_for_one)
    body = traces_body(
        [
            resource_of(
                [
                    {
                        "spans": [
                            span_entry("a", "first"),
                            span_entry("b", "broken"),
                            span_entry("c", "last"),
                        ]
                    }
                ]
            )
        ]
    )
    assert replay.accept("traces", body) == 3
    assert replay.logged == ["otlp: ValidationError"]
    assert replay.session("otel:broken") is None
    assert tool_names(replay, "otel:first") == ["tool-a"]
    assert tool_names(replay, "otel:last") == ["tool-c"]


def log_record(name: str, session: str) -> dict[str, object]:
    return {
        "timeUnixNano": nano(BASE_MS),
        "attributes": string_attributes(
            {
                "event.name": "claude_code.tool_result",
                "session.id": session,
                "tool_name": name,
            }
        ),
    }


def logs_body(records: list[object]) -> dict[str, object]:
    return {"resourceLogs": [{"scopeLogs": [{"logRecords": records}]}]}


def test_a_fault_while_staging_leaves_the_source_untouched_so_a_retry_stores_once(
    monkeypatch: pytest.MonkeyPatch,
):
    replay = make_replay()
    replay.clock["now"] = BASE_MS + SECOND
    body = logs_body(
        [
            log_record("one", "retry"),
            log_record("two", "retry"),
            log_record("three", "retry"),
        ]
    )
    original = LogStager.stage_record
    calls: list[object] = []

    def failing_on_second(self, staged, resource_attributes, record_raw):
        calls.append(record_raw)
        if len(calls) == 2:
            raise RuntimeError("staging fault")
        original(self, staged, resource_attributes, record_raw)

    monkeypatch.setattr(LogStager, "stage_record", failing_on_second)
    with pytest.raises(RuntimeError):
        replay.source.accept_logs(LogsBody.model_validate(body))
    assert len(calls) == 2
    assert replay.source.logs == {} and replay.source.traces == {}
    assert replay.store.json_of("otel-log:retry") is None
    monkeypatch.setattr(LogStager, "stage_record", original)
    assert replay.source.accept_logs(LogsBody.model_validate(body)) == 3
    assert [
        turn["name"] for turn in replay.session("otel-log:retry")["agents"][0]["turns"]
    ] == [
        "one",
        "two",
        "three",
    ]


@pytest.mark.parametrize("case", ["snake_traces", "snake_logs"])
def test_only_the_camel_case_body_fields_are_read(case: str):
    _, outputs = play(case)
    [step] = outputs
    assert step["returned"] == 0
    assert step["logged"] == 0
    assert all(session is None for session in step["sessions"].values())
    assert TracesBody.model_validate({"resource_spans": [1]}).resource_spans is None
    assert LogsBody.model_validate({"resource_logs": [1]}).resource_logs is None
