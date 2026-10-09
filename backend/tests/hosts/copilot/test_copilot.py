import json
import os
import shutil
from pathlib import Path

import pytest

from tests.scenario_data import case_names, load_scenario
from tests.support.replay import (
    perform_polling_action,
    play_steps,
)
from trellis.hosts.copilot import CopilotSource
from trellis.hosts.copilot.source import CachedChat
from trellis.hosts.copilot.replay import replay_log
from trellis.runtime.store import Store

TESTS_DIRECTORY = Path(__file__).resolve().parents[2]
FIXTURE_DIRECTORY = TESTS_DIRECTORY / "fixtures" / "copilot"
PAYLOAD_DIRECTORY = TESTS_DIRECTORY / "payloads" / "copilot"
CASES = case_names("copilot")
SESSION_CASES = case_names("copilot_sessions")
DAY_MS = 86_400_000


def perform(source: CopilotSource, root: Path, action: dict) -> None:
    if not perform_polling_action(source, action["type"]):
        raise AssertionError(action["type"])


def play_case(
    name: str, home: Path, monkeypatch: pytest.MonkeyPatch
) -> tuple[dict, list[dict | None]]:
    monkeypatch.setenv("HOME", str(home))
    scenario = load_scenario("copilot", name)
    root = home / name
    fixture_src = FIXTURE_DIRECTORY / name
    if fixture_src.exists():
        shutil.copytree(fixture_src, root)
    store = Store()
    source = CopilotSource(
        roots=[str(root)],
        since_ms=DAY_MS,
        store=store,
        log=None,
        clock=lambda: scenario["now"],
    )
    outputs = play_steps(scenario, source, store, root, perform)
    return scenario, outputs


@pytest.mark.parametrize("name", CASES)
def test_committed_payload_equals_current_output(
    name: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    _, outputs = play_case(name, tmp_path, monkeypatch)
    payload_path = PAYLOAD_DIRECTORY / f"{name}.json"
    if os.environ.get("TRELLIS_WRITE_PAYLOADS"):
        PAYLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)
        payload_path.write_text(json.dumps(outputs, indent=2) + "\n", "utf-8")
    assert json.loads(payload_path.read_text("utf-8")) == outputs


def play_sessions_case(
    name: str, home: Path, monkeypatch: pytest.MonkeyPatch
) -> tuple[dict, dict[str, dict]]:
    monkeypatch.setenv("HOME", str(home))
    scenario = load_scenario("copilot_sessions", name)
    root = home / name
    shutil.copytree(FIXTURE_DIRECTORY / name, root)
    for extra in scenario["extraFiles"]:
        target = root / extra["relative"]
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(extra["content"]), "utf-8")
    store = Store()
    source = CopilotSource(
        roots=[str(root)],
        since_ms=DAY_MS,
        store=store,
        log=None,
        clock=lambda: scenario["now"],
    )
    source.scan()
    source.poll()
    outputs = {}
    for session_id in sorted(store.json):
        outputs[session_id] = json.loads(store.json[session_id])
    return scenario, outputs


@pytest.mark.parametrize("name", SESSION_CASES)
def test_sessions_case_committed_payload_equals_current_output(
    name: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    _, outputs = play_sessions_case(name, tmp_path, monkeypatch)
    payload_path = PAYLOAD_DIRECTORY / f"{name}.json"
    if os.environ.get("TRELLIS_WRITE_PAYLOADS"):
        PAYLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)
        payload_path.write_text(json.dumps(outputs, indent=2) + "\n", "utf-8")
    assert json.loads(payload_path.read_text("utf-8")) == outputs


def final_agents(
    name: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> list[dict]:
    _, outputs = play_case(name, tmp_path, monkeypatch)
    last = outputs[-1]
    assert last is not None
    return last["agents"]


def test_root_with_real_prompt_and_no_trim_is_complete(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    agents = final_agents("requests_with_subagent", tmp_path, monkeypatch)
    assert agents[0]["completeness"] == "complete"
    assert agents[1]["completeness"] == "complete"


def test_subagent_with_task_and_no_own_turn_is_partial(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    agents = final_agents("subagent_no_turns", tmp_path, monkeypatch)
    root, subagent = agents
    assert root["completeness"] == "complete"
    assert subagent["task"] == "Do the work"
    assert len(subagent.get("turns", [])) == 0
    assert subagent["completeness"] == "partial"


def test_sentinel_prompt_is_partial(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    agents = final_agents("sentinel_prompt", tmp_path, monkeypatch)
    assert agents[0]["task"] == "No prompt was recorded."
    assert agents[0]["completeness"] == "partial"


def test_trimmed_agent_is_partial(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    agents = final_agents("trimmed_turns", tmp_path, monkeypatch)
    assert agents[0]["trimmed"] == 621
    assert len(agents[0]["turns"]) == 600
    assert agents[0]["completeness"] == "partial"


def test_subagent_with_task_and_own_turn_is_complete(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    agents = final_agents("complete_subagent", tmp_path, monkeypatch)
    root, subagent = agents
    assert root["completeness"] == "complete"
    assert subagent["task"] == "Run the work"
    assert len(subagent.get("turns", [])) > 0
    assert subagent["completeness"] == "complete"


def test_activity_only_is_tool_turns_without_prompt(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    agents = final_agents("activity_only", tmp_path, monkeypatch)
    root = agents[0]
    assert root["task"] == "No prompt was recorded."
    assert {turn["kind"] for turn in root.get("turns", [])} == {"tool"}
    assert root["completeness"] == "activity_only"


def replay(tmp_path: Path, mutations: list[dict]) -> object:
    log_file = tmp_path / "chat.jsonl"
    log_file.write_text(
        "\n".join(json.dumps(item) for item in mutations) + "\n", "utf-8"
    )
    return replay_log(str(log_file))


def test_replay_walks_array_indexes_in_the_path(tmp_path: Path):
    state = replay(
        tmp_path,
        [
            {"kind": 0, "v": {"requests": [{"response": ["a"], "result": None}]}},
            {"kind": 2, "k": ["requests", 0, "response"], "v": ["b"]},
            {"kind": 1, "k": ["requests", 0, "result"], "v": {"done": True}},
        ],
    )
    assert state == {"requests": [{"response": ["a", "b"], "result": {"done": True}}]}


def test_replay_splices_the_tail_from_a_numeric_index(tmp_path: Path):
    state = replay(
        tmp_path,
        [
            {"kind": 0, "v": {"list": [1, 2, 3]}},
            {"kind": 2, "k": ["list"], "i": 1, "v": [9]},
        ],
    )
    assert state == {"list": [1, 9]}


def test_replay_delete_removes_object_key_and_leaves_array_hole(tmp_path: Path):
    state = replay(
        tmp_path,
        [
            {"kind": 0, "v": {"name": "x", "keep": 1, "list": ["a", "b", "c"]}},
            {"kind": 3, "k": ["name"]},
            {"kind": 3, "k": ["list", 1]},
        ],
    )
    assert state == {"keep": 1, "list": ["a", None, "c"]}


def test_replay_skips_lines_that_cannot_apply(tmp_path: Path):
    log_file = tmp_path / "chat.jsonl"
    lines = [
        json.dumps({"kind": 0, "v": {"list": [1]}}),
        "{not json",
        json.dumps({"kind": 1, "k": "list", "v": 5}),
        json.dumps({"kind": 1, "k": ["list", 4, "x"], "v": 5}),
        json.dumps({"kind": 2, "k": ["absent"], "v": [1]}),
    ]
    log_file.write_text("\n".join(lines) + "\n", "utf-8")
    assert replay_log(str(log_file)) == {"list": [1]}


def final_session(
    name: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> dict | None:
    _, outputs = play_case(name, tmp_path, monkeypatch)
    return outputs[-1]


def final_turns(
    name: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> list[dict]:
    return final_agents(name, tmp_path, monkeypatch)[0]["turns"]


def test_trims_follow_javascript_whitespace(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    session = final_session("trim_whitespace", tmp_path, monkeypatch)
    assert session is not None
    root = session["agents"][0]
    assert root["task"] == "Fix the bug now\x1c\x85"
    assert session["run"]["name"] == "Fix the bug now\x1c\x85"
    assert [
        (turn["kind"], turn.get("text") or turn["target"]) for turn in root["turns"]
    ] == [
        ("msg", "Answer\x1c\x85"),
        ("tool", "ls\x1c\x85"),
        ("user", "follow up\x1c\x85"),
        ("msg", "\x1c\x85"),
    ]


def test_tool_name_drops_only_one_leading_copilot_prefix(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    turns = final_turns("tool_name_prefix", tmp_path, monkeypatch)
    assert [turn["name"] for turn in turns] == [
        "run_copilot_x",
        "copilot_x",
        "",
        "Copilot_upper",
        "y",
        "z",
        "tool",
        "7",
    ]


def test_empty_object_result_counts_as_a_recorded_result_on_the_root(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    session = final_session("root_empty_result", tmp_path, monkeypatch)
    assert session is not None
    root = session["agents"][0]
    assert session["live"] is False
    assert root["end"] == 0
    assert root["final"] == "complete"
    assert root["returned"]["summary"] == "Answer text."


def test_empty_object_result_ends_a_subagent_without_its_own_result(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    session = final_session("subagent_empty_result", tmp_path, monkeypatch)
    assert session is not None
    subagent = session["agents"][1]
    assert session["live"] is True
    assert subagent["end"] == 0
    assert subagent["final"] == "complete"
    assert subagent["returned"] == {"summary": "Scouted", "items": []}


def test_tool_target_falls_through_empty_values_and_past_tense_message(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    turns = final_turns("tool_target_chain", tmp_path, monkeypatch)
    assert [turn["target"] for turn in turns] == [
        "ls",
        "PAST",
        "5",
        "T x",
        "cmd",
        "orig",
        "PV",
        "inv-h",
        "",
    ]
    assert turns[-1]["pending"] is True
    assert turns[-1]["fail"] is True


def test_tool_output_keeps_empty_strings_links_and_serializes_non_strings(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    turns = final_turns("tool_output_forms", tmp_path, monkeypatch)
    assert [turn["out"] for turn in turns] == [
        "  see [link](http://x) text  ",
        '{"isError":true,"code":3}',
        "PT a",
        "5",
        '{"nested":1}',
        "zero",
        "plain string",
        "a\nb\n[image]",
        "from content",
        "after null",
        "empty list",
        "42",
        "{}",
    ]
    assert turns[1]["fail"] is True


def test_subagent_task_name_and_brief_use_the_first_non_empty_string(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    agents = final_agents("subagent_forms", tmp_path, monkeypatch)
    subagents = agents[1:]
    assert [agent["task"] for agent in subagents] == [
        "only desc",
        "link inv",
        "no tsd task",
        "null desc",
        "See [docs](http://x) here",
    ]
    assert [agent["name"] for agent in subagents] == [
        "Subagent",
        "Subagent",
        "Subagent",
        "Named",
        "Subagent",
    ]
    assert [agent.get("brief", "unset") for agent in subagents] == [
        "only desc",
        "",
        "unset",
        None,
        "brief",
    ]
    assert [agent["final"] for agent in subagents] == [
        "complete",
        "complete",
        "complete",
        "failed",
        "complete",
    ]
    assert subagents[-1]["returned"]["summary"] == "Past msg"
    assert agents[0]["turns"][0]["name"] == "sub agent"


def test_subagent_id_matches_case_insensitively_through_build(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    agents = final_agents("subagent_forms", tmp_path, monkeypatch)
    assert agents[1]["parent"] == 1
    assert (
        len([turn for turn in agents[0]["turns"] if turn["name"] == "sub agent"]) == 1
    )


def test_parts_without_a_subagent_id_stay_with_the_root(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    agents = final_agents("subagent_undefined_call_id", tmp_path, monkeypatch)
    root, first, second = agents
    assert [turn["name"] for turn in root["turns"]] == ["plain1", "plain2", "plain3"]
    assert first["turns"] == []
    assert second["parent"] == root["id"]


def test_workspace_names_follow_url_and_uri_component_decoding(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    _, outputs = play_sessions_case("workspace_names", tmp_path, monkeypatch)
    repos = {
        session_id.removeprefix("copilot:"): session["run"]["repo"]
        for session_id, session in outputs.items()
    }
    assert repos["trailing_slash"] == "proj"
    assert repos["plain"] == "proj"
    assert repos["bare_string"] == ""
    assert repos["bad_escape"] == "bad%zzname"
    assert repos["truncated_escape"] == "proj%"
    assert repos["invalid_utf8_escape"] == ""
    assert repos["encoded_space"] == "my proj"
    assert repos["encoded_slash"] == "y"
    assert repos["dot_segments"] == "d"
    assert repos["parent_last"] == "a"
    assert repos["array"] == ""
    assert repos["number"] == ""


def test_scan_accepts_only_json_and_jsonl_regular_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    _, outputs = play_sessions_case("scan_filter", tmp_path, monkeypatch)
    assert sorted(outputs) == [
        "copilot:empty-window-json",
        "copilot:file-json",
        "copilot:file-jsonl",
    ]


def test_lone_carriage_return_does_not_split_a_mutation_line(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    turns = final_turns("mutation_lone_carriage_return", tmp_path, monkeypatch)
    assert [turn["text"] for turn in turns] == ["beforecrlf lineafter"]


def test_invalid_utf8_byte_in_a_log_becomes_a_replacement_character(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    turns = final_turns("mutation_invalid_utf8", tmp_path, monkeypatch)
    assert [turn["text"] for turn in turns] == ["beforebad-\ufffd-byteafter"]


def test_a_null_mutation_line_is_skipped(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("HOME", str(tmp_path))
    root = tmp_path / "mutation_null_line"
    shutil.copytree(FIXTURE_DIRECTORY / "mutation_null_line", root)
    store = Store()
    source = CopilotSource(
        roots=[str(root)],
        since_ms=DAY_MS,
        store=store,
        log=None,
        clock=lambda: load_scenario("copilot", "mutation_null_line")["now"],
    )
    source.scan()
    source.poll()
    session = json.loads(store.json["copilot:s22"])
    assert [turn["text"] for turn in session["agents"][0]["turns"]] == ["beforeafter"]


def test_numeric_string_timestamps_are_read_as_numbers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    session = final_session("timestamp_strings", tmp_path, monkeypatch)
    assert session is not None
    assert session["endAt"] == 40
    assert [(turn["kind"], turn["at"]) for turn in session["agents"][0]["turns"]] == [
        ("msg", 4),
        ("user", 0),
        ("msg", 2),
        ("tool", 2),
        ("user", 20),
        ("msg", 24),
        ("tool", 24),
        ("user", 40),
        ("msg", 40),
    ]


def test_numeric_string_elapsed_time_is_added_as_a_number(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    session = final_session("elapsed_string", tmp_path, monkeypatch)
    assert session is not None
    assert session["endAt"] == 5


def test_replay_reads_bytes_and_splits_only_on_line_feed(tmp_path: Path):
    log_file = tmp_path / "chat.jsonl"
    first = json.dumps({"kind": 0, "v": {"list": []}})
    push = json.dumps({"kind": 2, "k": ["list"], "v": ["a"]})
    log_file.write_bytes(
        (first + "\n" + push + "\r" + push + "\n").encode()
        + b"\xff\n"
        + (push + "\r\n").encode()
    )
    assert replay_log(str(log_file)) == {"list": ["a"]}


def test_refresh_continues_after_first_build_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    logs = []

    def capture_log(message: str) -> None:
        logs.append(message)

    from trellis.hosts.copilot.build import SessionBuilder as RealSessionBuilder

    store = Store()
    source = CopilotSource(
        roots=[str(tmp_path)],
        since_ms=DAY_MS,
        store=store,
        log=capture_log,
        clock=lambda: 1000000,
    )

    first_file = str(tmp_path / "first.json")
    second_file = str(tmp_path / "second.json")

    first_data = {"requests": [{"text": "first"}]}
    second_data = {"requests": [{"text": "second"}]}

    source.meta[first_file] = CachedChat(
        session_id="copilot:x", data=first_data, repo="", last_ts=500000
    )
    source.meta[second_file] = CachedChat(
        session_id="copilot:x", data=second_data, repo="", last_ts=500000
    )

    build_count = {"count": 0}
    original_build = RealSessionBuilder.build

    def failing_build_on_first(self):
        build_count["count"] += 1
        if build_count["count"] == 1:
            raise ValueError("Distinctive error for testing refresh")
        return original_build(self)

    monkeypatch.setattr(
        "trellis.hosts.copilot.source.SessionBuilder.build",
        failing_build_on_first,
    )

    source.refresh()

    assert len(logs) == 1
    assert "copilot: could not build" in logs[0]
    assert first_file in logs[0]
    assert "ValueError" in logs[0]
    assert "Distinctive error for testing refresh" not in logs[0]
    assert any("copilot:" + second_file in key for key in store.json.keys())


def test_poll_logs_exception_type_not_message_on_build_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    logs = []

    def capture_log(message: str) -> None:
        logs.append(message)

    home = tmp_path / "home"
    home.mkdir()
    root = home / "test_poll_failure"
    root.mkdir()

    ws_dir = root / "workspaceStorage" / "test-ws" / "chatSessions"
    ws_dir.mkdir(parents=True)

    session_file = ws_dir / "session.json"
    session_data = {"requests": [{"text": "test"}]}
    session_file.write_text(json.dumps(session_data), "utf-8")

    store = Store()
    source = CopilotSource(
        roots=[str(root)],
        since_ms=DAY_MS,
        store=store,
        log=capture_log,
        clock=lambda: 1000000,
    )

    source.scan()

    def failing_build_method(self):
        raise RuntimeError("Distinctive message for poll test")

    monkeypatch.setattr(
        "trellis.hosts.copilot.source.SessionBuilder.build",
        failing_build_method,
    )

    source.poll()

    assert len(logs) == 1
    assert "copilot: could not read" in logs[0]
    assert "RuntimeError" in logs[0]
    assert "Distinctive message for poll test" not in logs[0]
