from tests.scenario_data import load_scenario
from tests.support.otlp_replay import (
    BASE_MS,
    SECOND,
    agent_names,
    body_of,
    final_session,
    final_sessions,
    make_replay,
    play,
    present,
    projection,
    tool_turns,
)
from tests.support.replay import without_completeness


def test_source_names_are_matched_without_unicode_case_folding():
    sessions = final_sessions("source_names")
    sources = {
        session_id: session["run"]["source"]
        for session_id, session in sessions.items()
        if session is not None
    }
    assert sources == {
        "otel:src1": "Claude Code",
        "otel:src2": "Codex",
        "otel:src3": "GitHub Copilot",
        "otel:src4": "GitHub Copilot",
        "otel:src5": "v\u017fcode",
        "otel:src6": "cop\u0131lot",
        "otel:src7": "\u212aelvin-svc",
        "otel:src8": "Claude Code",
        "otel:src9": "Codex",
        "otel:src10": "unknown-svc",
        "otel:src11": "OpenTelemetry",
        "otel:src12": "OpenTelemetry",
        "otel:src13": "OpenTelemetry",
        "otel:src14": "OpenTelemetry",
        "otel:src15": "Codex",
        "otel:src16": "Claude Code",
        "otel:srcNum": "7",
        "otel:srcOverride": "Codex",
    }
    assert present(sessions, "otel:srcOverride")["run"]["repo"] == "override-svc"
    assert present(sessions, "otel:src1")["agents"][0]["src"] == "Claude Code"


def test_log_events_must_end_with_the_name_and_the_source_falls_back_to_the_prefix():
    sessions = final_sessions("log_events")
    stored = sorted(key for key, session in sessions.items() if session is not None)
    assert stored == [
        "otel-log:1.5",
        "otel-log:ev1",
        "otel-log:ev10",
        "otel-log:ev11",
        "otel-log:ev2",
        "otel-log:ev6b",
        "otel-log:ev7",
        "otel-log:ev8",
        "otel-log:ev9",
    ]
    sources = {key: present(sessions, key)["run"]["source"] for key in stored}
    assert sources["otel-log:ev1"] == "Claude Code"
    assert sources["otel-log:ev2"] == "Codex"
    assert sources["otel-log:ev6b"] == "a"
    assert sources["otel-log:ev9"] == "GitHub Copilot"
    assert sources["otel-log:ev10"] == "Codex"
    assert sources["otel-log:ev11"] == "keeper"
    nested = present(sessions, "otel-log:ev6b")["agents"][0]["turns"]
    assert [(turn["name"]) for turn in nested] == ["Nested"]
    from_body = present(sessions, "otel-log:ev7")["agents"][0]["turns"]
    assert [turn["text"] for turn in from_body] == ["API error: unknown"]


def test_log_events_count_only_the_records_that_were_kept():
    _, outputs = play("log_events")
    assert outputs[0]["returned"] == 9


def test_decisions_match_reject_denied_or_abort_in_ascii_case_only():
    session = final_session("log_decisions_and_errors", "otel-log:dc")
    texts = [turn["text"] for turn in session["agents"][0]["turns"]]
    assert texts == [
        "Bash was not approved (user).",
        "A tool was not approved (DENIED).",
        "A tool was not approved (Abort).",
        "A tool was not approved (config).",
        "A tool was not approved (denied).",
        "A tool was not approved (REJECT\n).",
        "A tool was not approved (a,b).",
        "API error: boom",
        "API error: 500",
        "API error: 404",
        "API error: unknown",
        "API error: 1.5",
        "API error: x",
    ]


def test_tool_result_fields_use_nullish_fallbacks_not_falsy_ones():
    session = final_session("log_tool_results", "otel-log:trs")
    rows = tool_turns(session["agents"][0])
    assert rows["tool-35"]["target"] == ""
    assert rows["tool-36"]["target"] == "0"
    assert rows["tool-37"]["target"] == "viaargs2"
    assert rows["tool-38"]["target"] == "/a/b"
    assert rows["tool-40"]["out"] == ""
    assert rows["tool-41"]["out"] == "boom"
    assert rows["tool-42"]["out"] == "0"
    assert rows["tool-43"]["out"] == "a,b"
    assert rows["tool-44"]["out"] == "[object Object]"
    assert [turn["name"] for turn in session["agents"][0]["turns"]][31:34] == [
        "n",
        "tool",
        "n2",
    ]


def test_tool_result_durations_are_read_as_ascii_numbers_and_ignored_otherwise():
    session = final_session("log_tool_results", "otel-log:trs")
    rows = tool_turns(session["agents"][0])
    expected = {
        "tool-1": 1200,
        "tool-5": 1500.5,
        "tool-11": -500,
        "tool-12": 7,
        "tool-13": 1000,
        "tool-19": 2,
        "tool-21": 5,
        "tool-22": 5,
    }
    assert {name: row["ms"] for name, row in rows.items() if "ms" in row} == expected
    assert rows["tool-4"]["at"] == 40
    assert rows["tool-10"]["at"] == 100
    assert rows["tool-11"]["at"] == 111


def test_integral_durations_serialize_as_integers_and_unreadable_ones_are_left_out():
    replay = make_replay()
    scenario = load_scenario("otlp", "log_tool_results")
    step = scenario["steps"][0]
    replay.clock["now"] = step["now"]
    replay.accept("logs", body_of("log_tool_results", step["action"]))
    dumped = replay.store.json_of("otel-log:trs")
    assert dumped is not None
    assert '"name":"tool-19","target":"","out":"","ms":2}' in dumped
    assert '"name":"tool-4","target":"","out":""}' in dumped
    assert '"name":"tool-10","target":"","out":""}' in dumped


def test_a_clip_that_cuts_a_surrogate_pair_leaves_an_escaped_lone_surrogate():
    replay = make_replay()
    scenario = load_scenario("otlp", "clip_limits")
    step = scenario["steps"][0]
    replay.clock["now"] = step["now"]
    replay.accept("traces", body_of("clip_limits", step["action"]))
    dumped = replay.store.json_of("otel:cl1")
    assert dumped is not None
    assert "\\ud83d\u2026" in dumped
    assert dumped.count("\\ud83d\u2026") == 3


def test_clip_limits_cut_at_utf16_units():
    sessions = final_sessions("clip_limits")
    emoji = "\U0001f600"
    cl1 = present(sessions, "otel:cl1")["agents"][0]
    assert cl1["task"] == "a" * 11999 + "\ud83d\u2026"
    tool = tool_turns(cl1)["big"]
    assert tool["out"] == "b" * 3999 + "\ud83d\u2026"
    [message] = [turn for turn in cl1["turns"] if turn["kind"] == "msg"]
    assert message["text"] == "c" * 5999 + "\ud83d\u2026"
    assert present(sessions, "otel:cl1")["run"]["name"] == "a" * 80 + "\u2026"
    assert present(sessions, "otel:cl2")["run"]["name"] == "x" * 79 + "\ud83d\u2026"
    assert emoji not in present(sessions, "otel:cl2")["run"]["name"]
    assert (
        present(sessions, "otel:cl3")["run"]["name"] == "line one\rline two\u2028three"
    )
    assert present(sessions, "otel:cl4")["agents"][0]["task"].endswith("alpha\u2026")
    assert len(present(sessions, "otel:cl6")["agents"][0]["task"]) == 12000
    assert len(present(sessions, "otel:cl7")["agents"][0]["task"]) == 12001
    assert present(sessions, "otel:cl8")["run"]["name"] == "n" * 80
    assert present(sessions, "otel:cl9")["run"]["name"] == "n" * 80 + "\u2026"
    assert (
        len(tool_turns(present(sessions, "otel:cl11")["agents"][0])["exact"]["out"])
        == 4000
    )
    assert (
        len(tool_turns(present(sessions, "otel:cl12")["agents"][0])["over"]["out"])
        == 4001
    )


def test_the_log_cap_shifts_the_oldest_record_only_past_5000():
    exact = projection("cap_records_5000", "otel-log:cap5000")
    over = projection("cap_records_5001", "otel-log:cap5001")
    assert exact["t0"] == BASE_MS
    assert over["t0"] == BASE_MS + SECOND
    assert exact["agents"][0]["trimmed"] == over["agents"][0]["trimmed"] == 4400
    assert over["agents"][0]["last"] == ["tool", "tool5000", 4999]


def test_log_completeness_is_partial_only_when_a_real_prompt_set_the_task():
    sessions = final_sessions("redacted_prompt")
    by_id = {
        session_id: present(sessions, session_id)["agents"][0]["completeness"]
        for session_id in sessions
        if sessions[session_id] is not None
    }
    assert by_id == {
        "otel-log:red1": "activity_only",
        "otel-log:red2": "activity_only",
        "otel-log:red3": "activity_only",
        "otel-log:red5": "activity_only",
        "otel-log:red6": "activity_only",
        "otel-log:red7": "activity_only",
        "otel-log:real1": "partial",
    }
    assert final_session("log_only", "otel-log:sess9")["agents"][0]["completeness"] == (
        "partial"
    )


def test_event_timestamps_fall_back_to_the_step_clock_when_unparseable_or_zero():
    scenario, outputs = play("event_timestamps")
    session = present(outputs[0]["sessions"], "otel-log:ts1")
    now = scenario["steps"][0]["now"]
    by_name = tool_turns(session["agents"][0])

    def expected(milliseconds: int) -> int:
        return int((milliseconds - session["t0"]) / 1000 + 0.5)

    assert by_name["valid"]["at"] == expected(BASE_MS + 5000)
    for name in ("invalid", "empty", "missing", "epoch"):
        assert by_name[name]["at"] == expected(now), name
    assert by_name["zero-string"]["at"] == expected(BASE_MS + 7000)
    assert by_name["zero-number"]["at"] == expected(BASE_MS + 9000)
    assert by_name["primary-wins"]["at"] == expected(BASE_MS + 13000)
    later = present(outputs[1]["sessions"], "otel-log:ts1")
    second = tool_turns(later["agents"][0])
    assert second["later-now"]["at"] == expected(scenario["steps"][1]["now"])
    assert second["later-valid"]["at"] == expected(BASE_MS + 20000)


def test_a_non_string_event_timestamp_reads_as_unparseable():
    non_string = final_sessions("timestamp_non_string")
    missing = final_sessions("timestamp_missing")
    assert without_completeness(
        present(non_string, "otel-log:ts1")
    ) == without_completeness(present(missing, "otel-log:ts1"))


def test_bare_event_names_without_a_prefix_are_skipped():
    _, outputs = play("bare_events")
    [step] = outputs
    assert step["returned"] == 1
    stored = [key for key, session in step["sessions"].items() if session is not None]
    assert stored == ["otel-log:control"]


def test_trailing_whitespace_after_the_prefix_is_kept():
    session = final_session("name_trailing_whitespace", "otel:nt2")
    assert agent_names(session) == ["Worker  \t"]
    assert list(tool_turns(session["agents"][0])) == ["tool_b \xa0", "tool_c"]
