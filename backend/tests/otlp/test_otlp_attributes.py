import json

from trellis.otlp.attributes import messages_text

from tests.support.otlp_replay import (
    agent_names,
    final_session,
    final_sessions,
    play,
    present,
    tool_turns,
)


def test_spans_whose_ids_are_not_strings_are_skipped_and_logged():
    _, outputs = play("map_keys")
    assert outputs[0]["returned"] == 8
    assert outputs[0]["logged"] == 8
    session = present(outputs[-1]["sessions"], "otel:mk")
    assert agent_names(session) == ["Str", "Undef", "TieFirstRenamed", "TieSecond"]
    assert [sorted(tool_turns(agent)) for agent in session["agents"]] == [
        ["tool-str"],
        ["tool-null-parent"],
        ["tool-x"],
        [],
    ]


def test_status_codes_fail_only_for_the_number_two_and_the_named_error():
    tools = final_session("spans_status", "otel:st")["agents"][0]
    failing = {name for name, turn in tool_turns(tools).items() if turn.get("fail")}
    assert failing == {
        "status-number-two",
        "status-float-two",
        "status-named-error",
        "status-empty-message",
    }
    outs = {name: turn["out"] for name, turn in tool_turns(tools).items()}
    assert outs["status-string-two"] == "string two"
    assert "status-numeric-message" not in outs
    assert "status-object-message" not in outs
    assert outs["status-empty-message"] == ""
    agents = final_session("spans_status", "otel:st2")["agents"]
    finals = {agent["name"]: agent["final"] for agent in agents}
    assert {name for name, final in finals.items() if final == "failed"} == {
        "Agent-number-two",
        "Agent-float-two",
        "Agent-named-error",
        "Agent-empty-message",
    }


def test_attribute_values_are_read_from_the_typed_value_fields():
    tools = tool_turns(final_session("value_shapes", "otel:vs")["agents"][0])
    outs = {name.removeprefix("result-"): turn["out"] for name, turn in tools.items()}
    assert outs["int-string"] == "5" and outs["int-number"] == "7"
    assert outs["double"] == "1.5" and outs["double-integral"] == "2"
    assert outs["bool"] == "true"
    assert outs["array-strings"] == "a\nb"
    assert outs["kv-text"] == "kvtext"
    assert outs["kv-nested"] == '{"k":[null,"z"]}'
    assert outs["string-first"] == "s" and outs["int-before-double"] == "3"
    assert outs["raw-null"] == "status text"
    assert tools["arguments-kv-command"]["target"] == "kvcmd"
    assert tools["arguments-kv-pattern"]["target"] == "todo  src"


def test_span_attributes_override_resource_attributes_and_malformed_lists_are_skipped():
    sessions = final_sessions("attribute_merge")

    def first_tool(session_id: str) -> str:
        return present(sessions, session_id)["agents"][0]["turns"][0]["name"]

    assert first_tool("otel:res-sess") == "from-resource"
    assert first_tool("otel:span-sess") == "second"
    assert first_tool("otel:T3") == "from-resource"
    assert sessions["otel:list-key-sess"] is None
    _, outputs = play("attribute_merge")
    assert [(step["returned"], step["logged"]) for step in outputs] == [(3, 1), (0, 1)]


def test_session_keys_skip_blank_values_and_spans_without_a_key_are_skipped():
    sessions = final_sessions("session_keys")
    for session_id in (
        "otel:second-wins",
        "otel:thread-wins",
        "otel:after-falsy",
        "otel:first-wins",
        "otel:TR-k4",
        "otel:5",
    ):
        assert present(sessions, session_id)["rawId"] == session_id.removeprefix(
            "otel:"
        )
    for session_id in ("otel:third-wins", "otel:undefined", "otel:null", "otel:"):
        assert sessions[session_id] is None
    _, outputs = play("session_keys")
    assert (outputs[0]["returned"], outputs[0]["logged"]) == (6, 4)


def test_session_key_attributes_are_taken_in_priority_order():
    sessions = final_sessions("priority_session_key")
    stored = sorted(key for key, session in sessions.items() if session is not None)
    assert stored == ["otel:c3", "otel:g2", "otel:g4", "otel:s1"]


def test_text_wins_over_value_in_message_content():
    session = final_session("text_and_value", "otel:tv")
    assert [agent["task"] for agent in session["agents"]] == [
        "T1",
        "T2",
        "V3",
        "T4",
        "V5",
        "T6",
    ]


def test_message_text_comes_from_the_last_message_with_the_role():
    messages = [
        {"role": "user", "parts": [{"content": "first"}]},
        {"role": "assistant", "parts": [{"content": "answer"}]},
        {"role": "user", "content": "second"},
        {"parts": [{"text": "no role"}, {"content": "again"}]},
    ]
    assert messages_text(messages, "user") == "no role\nagain"
    assert messages_text(messages[:3], "user") == "second"
    assert messages_text(messages[:3], "assistant") == "answer"
    assert messages_text(json.dumps(messages[:3]), "user") == "second"
    assert messages_text("just words", "user") == "just words"
    assert messages_text([{"role": "assistant", "content": "x"}], "user") == ""
    assert messages_text(None, "user") == ""
    assert (
        messages_text([{"role": "user", "parts": "bad", "content": "kept"}], "user")
        == "kept"
    )
