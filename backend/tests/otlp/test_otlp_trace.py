import pytest

from tests.builders import NEVER_EVICT_MS
from tests.support.otlp_replay import (
    BASE_MS,
    SECOND,
    agent_names,
    completeness_by_name,
    final_session,
    final_sessions,
    generated_body,
    play,
    present,
    projection,
    projection_of,
)
from trellis.otlp.bodies import LogsBody, TracesBody
from trellis.otlp.source import OtlpSource
from trellis.runtime.store import Store
from trellis.sessions.constants import LIVE_MS


def test_output_messages_become_the_returned_summary():
    session = final_session("message_shapes", "otel:ms2")
    summaries = {
        agent["name"]: agent["returned"]["summary"] for agent in session["agents"]
    }
    assert summaries == {
        "out-parts": "Final answer",
        "out-wrong-role": "Finished.",
        "out-plain": "plain output",
        "out-empty": "Finished.",
        "out-no-role": "no role output",
    }


@pytest.mark.parametrize(
    ("case", "session_id", "live"),
    [
        ("trace_live_inside", "otel:lv1", True),
        ("trace_live_edge", "otel:lv2", False),
        ("log_live_inside", "otel-log:lv5", True),
        ("log_live_edge", "otel-log:lv6", False),
        ("trace_refresh_inside", "otel:lv3", False),
        ("trace_refresh_edge", "otel:lv4", True),
        ("log_refresh_inside", "otel-log:lv7", False),
        ("log_refresh_edge", "otel-log:lv8", True),
    ],
)
def test_liveness_and_refresh_windows_use_strict_comparisons(
    case: str, session_id: str, live: bool
):
    session = final_session(case, session_id)
    assert session["live"] is live
    [agent] = session["agents"]
    assert ("end" in agent) is (not live)


def test_refresh_rebuilds_traces_before_logs():
    store = Store()
    clock = {"now": BASE_MS + SECOND}
    source = OtlpSource(
        since_ms=NEVER_EVICT_MS, store=store, clock=lambda: clock["now"]
    )
    log_body = generated_body(
        {"kind": "records", "session": "logs-first", "from": 0, "to": 1}
    )
    trace_body = generated_body(
        {"kind": "spans", "session": "traces-second", "from": 0, "to": 1}
    )
    source.accept_logs(LogsBody.model_validate(log_body))
    source.accept_traces(TracesBody.model_validate(trace_body))
    changed: list[str] = []
    store.on_change(changed.append)
    clock["now"] = BASE_MS + LIVE_MS + 5 * SECOND
    source.refresh()
    assert changed == ["otel:traces-second", "otel-log:logs-first"]


def test_the_span_cap_drops_the_oldest_span_only_past_5000():
    exact = projection("cap_spans_5000", "otel:span5000")
    over = projection("cap_spans_5001", "otel:span5001")
    assert exact["t0"] == BASE_MS
    assert over["t0"] == BASE_MS + SECOND
    [exact_agent] = exact["agents"]
    [over_agent] = over["agents"]
    assert exact_agent["turns"] == over_agent["turns"] == 600
    assert exact_agent["trimmed"] == over_agent["trimmed"] == 4400
    assert exact_agent["first"] == ["tool", "tool4400", 4400]
    assert exact_agent["last"] == ["tool", "tool4999", 4999]
    assert over_agent["first"] == ["tool", "tool4401", 4400]
    assert over_agent["last"] == ["tool", "tool5000", 4999]


def test_a_resent_span_keeps_its_place_so_the_cap_still_drops_it_first():
    reset = projection("cap_spans_reset", "otel:reset")
    assert reset["t0"] == BASE_MS + SECOND
    [agent] = reset["agents"]
    assert agent["last"] == ["tool", "tool5000", 4999]
    assert agent["trimmed"] == 4400
    _, outputs = play("cap_spans_reset")
    middle = projection_of(present(outputs[1]["sessions"], "otel:reset"))
    assert middle["t0"] == BASE_MS


def test_the_turn_cap_trims_only_past_600_and_changes_completeness():
    exact = final_session("turns_600_agent", "otel:turns600")["agents"][0]
    over = final_session("turns_601_agent", "otel:turns601")["agents"][0]
    assert "trimmed" not in exact and len(exact["turns"]) == 600
    assert over["trimmed"] == 1 and len(over["turns"]) == 600
    assert over["turns"][0]["name"] == "tool1"
    assert exact["completeness"] == "complete"
    assert over["completeness"] == "partial"
    logs_exact = final_session("turns_600_logs", "otel-log:rec600")["agents"][0]
    logs_over = final_session("turns_601_logs", "otel-log:rec601")["agents"][0]
    assert "trimmed" not in logs_exact
    assert logs_over["trimmed"] == 1
    assert logs_over["turns"][0]["name"] == "tool1"


def test_trace_completeness_reads_the_task_and_the_output_separately():
    by_name = completeness_by_name(final_session("completeness_trace", "otel:co"))
    assert by_name == {
        "Lead": "partial",
        "Complete": "complete",
        "TaskOnly": "partial",
        "OutputOnly": "partial",
        "Activity": "activity_only",
        "Chatty": "partial",
        "PromptTask": "partial",
        "EmptyOutput": "partial",
        "Agent": "activity_only",
    }


def test_redacted_and_missing_prompts_use_the_placeholder_sentences():
    sessions = final_sessions("redacted_prompt")
    tasks = {
        session_id: present(sessions, session_id)["agents"][0]["task"][:32]
        for session_id in sessions
        if sessions[session_id] is not None
    }
    assert tasks["otel-log:red1"] == "A prompt of 120 characters (prom"
    assert tasks["otel-log:red2"] == "No prompt was recorded in the lo"
    assert tasks["otel-log:red3"].startswith("A prompt of 0 characters")
    assert tasks["otel-log:red5"].startswith("A prompt of unknown characters")
    assert tasks["otel-log:red6"].startswith("A prompt of  characters")
    assert tasks["otel-log:red7"].startswith("A prompt of unknown characters")


@pytest.mark.parametrize(
    ("case", "owner"),
    [("chain_63", "Child"), ("chain_64", "Root"), ("chain_65", "Root")],
)
def test_the_ancestor_walk_gives_up_after_64_hops(case: str, owner: str):
    session = final_session(case, f"otel:{case.replace('_', '')}")
    holders = [agent["name"] for agent in session["agents"] if agent["turns"]]
    assert holders == [owner]


def test_missing_parents_become_placeholder_agents_in_first_seen_order():
    session = final_session("placeholders_order", "otel:ph")
    assert agent_names(session) == ["Orchestrator", "Under", "Agent", "Agent"]
    assert [agent.get("parent") for agent in session["agents"]] == [None, 1, 1, 1]
    assert [turn["name"] for turn in session["agents"][0]["turns"]] == ["tool-a"]
    assert [turn["text"] for turn in session["agents"][2]["turns"]] == ["from c"]
    assert [turn["name"] for turn in session["agents"][3]["turns"]] == ["tool-b"]
    assert session["live"] is False
    assert session["agents"][0]["returned"]["summary"] == (
        "The trace ended without this agent's span."
    )


def test_a_trace_without_agent_spans_gets_a_synthetic_root_that_closes_with_the_trace():
    _, outputs = play("synthetic_root")
    live = present(outputs[0]["sessions"], "otel:sy")
    closed = present(outputs[1]["sessions"], "otel:sy")
    assert (live["live"], closed["live"]) == (True, False)
    assert live["agents"][0]["name"] == "Agent"
    assert "end" not in live["agents"][0]
    assert closed["agents"][0]["end"] == 1
    assert closed["agents"][0]["returned"]["summary"] == "Finished."
    assert [turn["name"] for turn in closed["agents"][0]["turns"][:3]] == [
        "second",
        "first",
        "third",
    ]
    assert closed["agents"][0]["turns"][3]["kind"] == "msg"


def test_a_delegation_cycle_between_agents_logs_and_stores_nothing():
    _, outputs = play("agent_graphs")
    assert outputs[0]["sessions"]["otel:cy"] is None
    assert (outputs[0]["returned"], outputs[0]["logged"]) == (2, 1)


def test_tools_in_a_parent_cycle_fall_back_to_the_first_agent():
    session = final_session("agent_graphs", "otel:cy2")
    assert [turn["name"] for turn in session["agents"][0]["turns"]] == [
        "cycle-tool",
        "self-parent",
    ]
    assert session["agents"][1]["turns"] == []


def test_several_roots_hang_from_the_earliest_and_ties_keep_arrival_order():
    session = final_session("agent_graphs", "otel:cy4")
    assert [(agent["name"], agent.get("parent")) for agent in session["agents"]] == [
        ("Earliest", None),
        ("Second", 1),
        ("First", 1),
        ("Kid", 2),
    ]
    single = final_session("agent_graphs", "otel:cy3")
    assert agent_names(single) == ["Main agent"]


def test_several_agents_rename_the_unnamed_first_one_orchestrator():
    session = final_session("tools_and_chats", "otel:tc1")
    assert agent_names(session) == [
        "Orchestrator",
        "Builder",
        "Explorer",
        "Reviewer",
        "Agent",
    ]
    assert [agent.get("parent") for agent in session["agents"]] == [None, 1, 1, 3, 1]
    assert session["agents"][3]["final"] == "failed"
    assert session["agents"][3]["returned"]["summary"] == "review failed"


def test_an_open_parent_reads_as_running_until_the_trace_goes_quiet():
    _, outputs = play("spans_open_parent")
    running = present(outputs[0]["sessions"], "otel:conv1")
    quiet = present(outputs[1]["sessions"], "otel:conv1")
    assert "end" not in running["agents"][0] and running["live"] is True
    assert quiet["live"] is False
    assert quiet["agents"][0]["end"] == 2
    assert quiet["agents"][0]["returned"]["summary"] == (
        "The trace ended without this agent's span."
    )
    assert running["agents"][1]["turns"][0]["fail"] is True
    assert running["run"]["source"] == "Codex"


def test_an_open_agent_with_its_own_output_but_no_task_is_partial():
    session = final_session("completeness_open_output", "otel:oo")
    assert completeness_by_name(session) == {
        "OutOnly": "partial",
        "Nothing": "activity_only",
    }
    assert all("end" not in agent for agent in session["agents"])
    assert session["live"] is True


def test_a_message_dropped_by_the_turn_cap_still_counts_as_output():
    [agent] = final_session("completeness_dropped_message", "otel:dm")["agents"]
    assert agent["trimmed"] == 1
    assert len(agent["turns"]) == 600
    assert {turn["kind"] for turn in agent["turns"]} == {"tool"}
    assert agent["task"] == "No task was recorded in the trace."
    assert agent["completeness"] == "partial"


def test_the_agent_task_takes_description_then_messages_then_prompt():
    session = final_session("priority_task", "otel:pt")
    assert {agent["name"]: agent["task"] for agent in session["agents"]} == {
        "p1": "D1",
        "p2": "M2",
        "p3": "P3",
        "p4": "M4",
    }


def test_an_empty_agent_name_falls_back_to_the_stripped_span_name():
    session = final_session("priority_agent_name", "otel:an")
    assert agent_names(session) == ["Stripped", "Attr", "Agent", "Zero"]


def test_a_falsy_operation_attribute_falls_back_to_the_span_name_prefix():
    session = final_session("priority_operation", "otel:op")
    assert agent_names(session) == ["FromName"]
    turns = session["agents"][0]["turns"]
    assert [turn.get("name", turn.get("text")) for turn in turns] == [
        "toolname",
        "chat text",
    ]


def test_empty_string_span_ids_and_parents_behave_like_javascript():
    session = final_session("empty_ids", "otel:ei")
    assert agent_names(session) == ["Empty", "Second"]
    assert session["agents"][1]["parent"] == 1
    assert [turn["name"] for turn in session["agents"][0]["turns"]] == [
        "empty-parent",
        "plain-id",
    ]
