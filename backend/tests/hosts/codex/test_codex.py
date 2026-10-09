import json
import os
import shutil
from collections.abc import Callable
from pathlib import Path

import pytest

from tests.scenario_data import case_names, load_scenario
from tests.support.replay import (
    perform_polling_action,
    play_steps,
    touch_tree,
    write_jsonl,
)
from trellis.hosts.codex import CodexSource
from trellis.hosts.codex.build import SessionBuilder
from trellis.hosts.codex.ingest import (
    CodexIngester,
    parent_of,
    parse_output,
    patch_target,
)
from trellis.hosts.codex.records import CodexFile
from trellis.runtime.store import Store

TESTS_DIRECTORY = Path(__file__).resolve().parents[2]
FIXTURE_DIRECTORY = TESTS_DIRECTORY / "fixtures" / "codex"
PAYLOAD_DIRECTORY = TESTS_DIRECTORY / "payloads" / "codex"
CASES = case_names("codex")
FROZEN_NOW = load_scenario("codex", "shell_output")["now"]
DAY_MS = 86_400_000


def make_source(
    root: Path, store: Store, log=None, since_ms: float = DAY_MS
) -> CodexSource:
    return CodexSource(
        roots=[str(root)],
        since_ms=since_ms,
        store=store,
        log=log,
        clock=lambda: FROZEN_NOW,
    )


def perform(source: CodexSource, root: Path, action: dict) -> None:
    kind = action["type"]
    if kind == "write":
        for entry in action["files"]:
            target = root / entry["file"]
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(entry["text"], "utf-8")
            seconds = (FROZEN_NOW - entry.get("ageMs", 0)) / 1000
            os.utime(target, (seconds, seconds))
    elif kind == "append":
        with open(root / action["file"], "a", encoding="utf-8") as handle:
            handle.write(action["text"])
    elif not perform_polling_action(source, kind):
        raise AssertionError(kind)


def play_case(
    name: str, home: Path, monkeypatch: pytest.MonkeyPatch
) -> tuple[dict, list[dict | None]]:
    monkeypatch.setenv("HOME", str(home))
    scenario = load_scenario("codex", name)
    root = home / name
    shutil.copytree(FIXTURE_DIRECTORY / name, root)
    touch_tree(root, FROZEN_NOW)
    store = Store()
    source = CodexSource(
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


def final_session(
    name: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> dict | None:
    _, outputs = play_case(name, tmp_path, monkeypatch)
    return outputs[-1]


def final_agents(
    name: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> list[dict]:
    last = final_session(name, tmp_path, monkeypatch)
    assert last is not None
    return last["agents"]


def tool_rows(agent: dict, *fields: str) -> list[tuple]:
    return [
        tuple(turn.get(field) for field in fields)
        for turn in agent["turns"]
        if turn["kind"] == "tool"
    ]


def test_base_fixture_agents_are_complete(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    agents = final_agents("shell_output", tmp_path, monkeypatch)
    assert [agent["completeness"] for agent in agents] == ["complete"]


def test_a_root_with_sentinel_task_is_partial(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    [root] = final_agents("sentinel_task", tmp_path, monkeypatch)
    assert root["task"] == "No prompt was recorded."
    assert {turn["kind"] for turn in root["turns"]} == {"msg", "tool"}
    assert root["completeness"] == "partial"


def test_a_trimmed_agent_is_partial(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    [root] = final_agents("trimmed", tmp_path, monkeypatch)
    assert root["trimmed"] == 1
    assert len(root["turns"]) == 600
    assert root["completeness"] == "partial"


def test_agents_with_only_tool_calls_are_activity_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    [root] = final_agents("activity_only", tmp_path, monkeypatch)
    assert {turn["kind"] for turn in root["turns"]} == {"tool"}
    assert root["task"] == "No prompt was recorded."
    assert root["completeness"] == "activity_only"


def test_a_conversation_turn_lost_to_the_trim_still_counts_as_conversation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    [root] = final_agents("trimmed_prefix", tmp_path, monkeypatch)
    assert root["task"] == "No prompt was recorded."
    assert root["trimmed"] == 1
    assert {turn["kind"] for turn in root["turns"]} == {"tool"}
    assert root["completeness"] == "partial"


def test_completeness_of_every_agent_in_a_tree(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    agents = final_agents("subagent_completeness", tmp_path, monkeypatch)
    assert [(agent["name"], agent["completeness"]) for agent in agents] == [
        ("Orchestrator", "complete"),
        ("Chatty", "partial"),
        ("Busy", "activity_only"),
        ("Tasked", "complete"),
        ("Empty", "activity_only"),
    ]
    agents = final_agents("subagent_tree", tmp_path / "second", monkeypatch)
    assert [(agent["name"], agent["completeness"]) for agent in agents] == [
        ("Orchestrator", "complete"),
        ("Explorer", "complete"),
    ]


def test_user_messages_are_cleaned_before_they_become_turns(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    [agent] = final_agents("user_message_filters", tmp_path, monkeypatch)
    assert agent["task"] == "First real task"
    assert [(turn["kind"], turn["text"]) for turn in agent["turns"]] == [
        ("user", "/compact keep it short"),
        ("user", "visible text"),
        ("user", "[object Object]"),
        ("user", "a,b"),
        ("user", "5"),
        ("user", "Interrupted."),
    ]


def test_instruction_headers_in_response_items_are_not_prompts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    [agent] = final_agents("instruction_prefix_filter", tmp_path, monkeypatch)
    assert agent["task"] == "First real prompt"
    assert [turn["text"] for turn in agent["turns"]] == [
        "#AGENTS.md is not the header",
        "note # AGENTS.md in the middle",
        "real after",
    ]


def test_task_complete_without_a_message_falls_back_to_the_last_message(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    agents = final_agents("task_complete_fallback", tmp_path, monkeypatch)
    assert {agent["name"]: agent["returned"]["summary"] for agent in agents} == {
        "Orchestrator": "All done.",
        "Alpha": "Sub said this.",
        "Beta": "The session ended.",
        "Gamma": "Gamma spoke.",
        "Delta": "Ignored say.",
        "Epsilon": "Only say.",
        "Zeta": "The session ended.",
        "Eta": "Zero is falsy.",
    }


PARSE_OUTPUT_CASES = [
    ('{"output":"","metadata":{"exit_code":0}}', ("", False, None)),
    ('{"output":[]}', ("[]", False, None)),
    ('{"output":"x","metadata":{"duration_seconds":0}}', ("x", False, 0)),
    ('{"output":"x","metadata":{"exit_code":0},"exit_code":1}', ("x", False, None)),
    ('{"output":"x","metadata":null,"exit_code":3}', ("x", True, None)),
    ('{"output":"x","metadata":{"duration_seconds":"0.5"}}', ("x", False, 500)),
    ('{"output":"x","duration_seconds":true}', ("x", False, None)),
    ('{"output":"x","duration_seconds":[5]}', ("x", False, None)),
    ('{"content":"from content","exit_code":false}', ("from content", True, None)),
    (
        '{"output":null,"content":"fallback","metadata":{"exit_code":null},"exit_code":2}',
        ("fallback", True, None),
    ),
    ('{"output":0}', ("0", False, None)),
    ('{"output":false}', ("false", False, None)),
    ('{"output":{"a":1}}', ('{"a":1}', False, None)),
    (
        '{"output":"x","duration_seconds":Infinity}',
        ('{"output":"x","duration_seconds":Infinity}', False, None),
    ),
    (
        '{"output":"x","exit_code":NaN}',
        ('{"output":"x","exit_code":NaN}', False, None),
    ),
    ("{}", ("{}", False, None)),
    ("[1,2]", ("[1,2]", False, None)),
    ('{"output":"x","metadata":{"exit_code":"0"}}', ("x", True, None)),
    ('{"output":"x","metadata":[],"exit_code":1}', ("x", True, None)),
    ('{"output":"x","metadata":"text","exit_code":1}', ("x", True, None)),
    ('{"output":"x","metadata":{"duration_seconds":0.0005}}', ("x", False, 1)),
    ('{"output":"x","metadata":{"duration_seconds":0.0025}}', ("x", False, 3)),
    ('{"output":"x","duration_seconds":-1}', ("x", False, -1000)),
    ('{"output":"x","duration_seconds":1e-7}', ("x", False, 0)),
    ('{"output":"x","duration_seconds":"  2  "}', ("x", False, 2000)),
    ('{"output":"x","duration_seconds":""}', ("x", False, None)),
    ('{"output":"x","duration_seconds":"0x10"}', ("x", False, None)),
    ("Exit code: 1\nbody", ("Exit code: 1\nbody", True, None)),
    ("a\rExit code: 1", ("a\rExit code: 1", True, None)),
    ("a Exit code: 2", ("a Exit code: 2", True, None)),
    ("a Exit code: 3", ("a Exit code: 3", True, None)),
    ("Exit code: 0", ("Exit code: 0", False, None)),
    ("Exit code: 00", ("Exit code: 00", True, None)),
    ("Exit code: x\nExit code: 1", ("Exit code: x\nExit code: 1", True, None)),
    ("Exit code: 0\nExit code: 1", ("Exit code: 0\nExit code: 1", False, None)),
    ("xExit code: 1", ("xExit code: 1", False, None)),
    ("Exit code: ٣", ("Exit code: ٣", False, None)),
    ('"Exit code: 1"', ('"Exit code: 1"', False, None)),
    (
        '{"output":"Exit code: 4\\nbody","metadata":{"exit_code":0}}',
        ("Exit code: 4\nbody", True, None),
    ),
    (
        [{"type": "text", "text": "a"}, {"type": "text", "text": "b"}],
        ("a\nb", False, None),
    ),
    ({"text": "t"}, ("t", False, None)),
    (5, ("5", False, None)),
    (True, ("true", False, None)),
    (None, ("", False, None)),
]


@pytest.mark.parametrize(("raw", "expected"), PARSE_OUTPUT_CASES)
def test_parse_output_cases(raw: object, expected: tuple):
    assert parse_output(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        '{"output":"x","duration_seconds":"abc"}',
        '{"output":"x","duration_seconds":"1_0"}',
        '{"output":"x","duration_seconds":"Infinity"}',
        '{"output":"x","duration_seconds":{}}',
    ],
)
def test_parse_output_reports_no_duration_for_a_non_numeric_one(raw: str):
    assert parse_output(raw) == ("x", False, None)


def test_tool_results_in_a_rollout_for_every_output_shape(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    [agent] = final_agents("output_shapes", tmp_path, monkeypatch)
    rows = tool_rows(agent, "ms", "fail")
    assert rows[:3] == [(100, None), (100, None), (0, None)]
    assert rows[6] == (100, None)
    assert rows[21:25] == [(100, True)] * 4
    assert rows[26:29] == [(100, True), (100, True), (100, None)]
    assert rows[-3:] == [(100, None)] * 3
    assert len(rows) == 52


@pytest.mark.parametrize("duration", ["1e308", '"1e308"'])
def test_an_overflowing_duration_falls_back_to_the_timestamp_difference(
    duration: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("HOME", str(tmp_path))
    root = tmp_path / "root"
    shutil.copytree(FIXTURE_DIRECTORY / "shell_output", root)
    [rollout] = root.rglob("*.jsonl")
    text = rollout.read_text("utf-8")
    escaped = duration.replace('"', '\\"')
    assert '"duration_seconds\\":0.07' in text
    rollout.write_text(
        text.replace('"duration_seconds\\":0.07', f'"duration_seconds\\":{escaped}'),
        "utf-8",
    )
    touch_tree(root, FROZEN_NOW)
    store = Store()
    source = make_source(root, store)
    source.scan()
    source.poll()
    [session_json] = [store.json_of(key) for key in store.sessions]
    [agent] = json.loads(session_json)["agents"]
    assert tool_rows(agent, "ms")[0] == (1000,)


def test_tolerated_records_do_not_stop_the_poll(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    [agent] = final_agents("tolerant_records", tmp_path, monkeypatch)
    assert agent["task"] == "Task with an odd stamp"
    assert agent["final"] == "failed"
    assert [
        turn["text"] for turn in agent["turns"] if turn["kind"] in ("user", "msg")
    ] == [
        "Second message, null stamp",
        "Third message, object stamp",
        "",
        "5",
        "5\nkept",
        "final failure",
    ]
    assert tool_rows(agent, "name", "target", "out", "pending") == [
        ("shell", "ls -la", "No result was recorded.", None),
        ("shell", '{"command":"ls","x":NaN}', "number result for string id", None),
        ("shell", "5", "No result was recorded.", None),
        ("shell", "", "No result was recorded.", None),
        ("shell", '{"command":"from array"}', "No result was recorded.", None),
        ("shell", "from object", "No result was recorded.", None),
        ("shell", "numeric id", "number result for string id", None),
        ("shell", "null id", "number result for string id", None),
        ("shell", "string id", "No result was recorded.", None),
        ("apply_patch", "object patch", "number result for string id", None),
        ("exec", "custom cmd", "number result for string id", None),
        ("shell", "ls -l", "number result for string id", None),
        ("web_search", "how to", "", None),
        ("web_search", "", "", None),
        ("web_search", "with id", "", None),
    ]
    assert "phases" not in agent


def test_ingest_accepts_records_that_are_ignored_or_tolerated():
    file_record = CodexFile("/tmp/odd.jsonl")
    for record in [
        5,
        "text",
        [1],
        {"type": "event_msg", "payload": {"type": 5}},
        {"type": "event_msg", "payload": None},
        {"type": "event_msg", "payload": "text"},
        {"type": "response_item", "payload": [1, 2]},
        {
            "type": "response_item",
            "timestamp": True,
            "payload": {"type": "web_search_call"},
        },
        {
            "type": "session_meta",
            "payload": {"id": "x", "source": {"subagent": "worker"}},
        },
    ]:
        CodexIngester(file_record).ingest(record)
    assert file_record.sid == "x"
    assert file_record.agent_name == ""
    assert file_record.first_ts == 0
    assert [event.kind for event in file_record.events] == ["use"]
    assert file_record.events[0].target == ""


@pytest.mark.parametrize(
    ("input_text", "expected"),
    [
        ("*** Begin Patch\n*** Update File: a.txt\rzzz", "a.txt"),
        ("*** Update File: b.txt﻿", "b.txt"),
        ("*** Update File: c.txt\x1f", "c.txt\x1f"),
        (
            "*** Update File: d1\n*** Add File: d2\n*** Delete File: d3\n*** Update File: d4",
            "d1, d2 (+2)",
        ),
        ("*** Update File:  ", ""),
        ("*** Update File: \nnext", "*** Update File: "),
        ({"command": "x"}, "x"),
        (None, ""),
        (
            "foo *** Update File: mid.txt *** Add File: tail",
            "mid.txt *** Add File: tail",
        ),
        ("*** Update File: e1\r\n*** Update File: e2", "e1, e2"),
        ("*** Update File: f g", "f"),
        (["*** Update File: h"], "h"),
        (5, "5"),
        ("*** Update File:  i.txt　", "i.txt"),
        ("*** update file: lower.txt", "*** update file: lower.txt"),
    ],
)
def test_patch_target_cases(input_text: object, expected: str):
    assert patch_target(input_text) == expected


def test_patch_targets_in_a_rollout(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    [agent] = final_agents("patch_targets", tmp_path, monkeypatch)
    assert [target for (target,) in tool_rows(agent, "target")] == [
        "a.txt",
        "b.txt",
        "c.txt\x1f",
        "d1, d2 (+2)",
        "",
        "*** Update File: ",
        "x",
        "",
        "mid.txt *** Add File: tail",
        "e1, e2",
        "f",
        "h",
        "5",
        "i.txt",
        "*** update file: lower.txt",
        "*** Move File: moved.txt",
        "src/x.ts",
    ]


@pytest.mark.parametrize(
    ("meta", "expected"),
    [
        ({"source": {"subagent": [{"parent_thread_id": "x"}]}}, "x"),
        ({"source": {"subagent": {"thread_spawn": {"parent_thread_id": "y"}}}}, "y"),
        ({"source": {"PARENT_ID": "z"}}, "z"),
        ({"source": {"parentXid": "z"}}, "z"),
        ({"source": {"parent\nid": "z"}}, ""),
        ({"source": {"parent id": "z"}}, ""),
        ({"source": {"parent\rid": "z"}}, ""),
        ({"source": {"parentıd": "z"}}, ""),
        ({"source": {"parent_thread_id": ""}, "parent_id": "fallback"}, "fallback"),
        ({"source": {"parent_id": "", "other": {"parent_id": "hidden"}}}, ""),
        ({"source": {"parent_thread_id": 5}}, ""),
        ({"source": {"child_id": "z"}}, ""),
        ({"source": {"parental": "z"}}, ""),
        ({"source": "parent_id", "parent_id": "top"}, "top"),
        ({"parent_id": "one", "parent_thread_id": "two"}, "one"),
        ({"parent_id": "", "parent_session_id": "three"}, "three"),
        ({}, ""),
    ],
)
def test_parent_of_cases(meta: dict, expected: str):
    assert parent_of(meta) == expected


def test_parent_lookup_depth_limit_and_shapes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    agents = final_agents("parent_variants", tmp_path, monkeypatch)
    assert [agent["name"] for agent in agents] == [
        "Orchestrator",
        "S01",
        "S02",
        "S03",
        "S04",
        "S05",
        "S06",
        "S07",
        "S08",
        "S13",
        "S16",
        "S18",
        "S21",
        "S22",
        "Subagent",
        "Subagent",
        "Grandchild",
    ]
    assert agents[-1]["parent"] == 2


def test_only_approval_request_types_ending_the_type_open_an_approval(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    [agent] = final_agents("approval_types", tmp_path, monkeypatch)
    assert agent["phases"] == [
        {
            "at": 6,
            "state": "blocked",
            "note": "Waiting for your approval to run shell npm test.",
        }
    ]


ROLLOUT_NAMES_KEPT = [
    "rollout-.jsonl",
    "rollout-2026-09-28T10-00-00-fn00.jsonl",
    "rollout-depth4.jsonl",
    "rollout-edge.jsonl",
    "rollout-good.jsonl",
    "rollout-\u00e9.jsonl",
]


def test_scan_takes_only_rollout_jsonl_files_within_the_window(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("HOME", str(tmp_path))
    scenario = load_scenario("codex", "filename_filter")
    root = tmp_path / "root"
    shutil.copytree(FIXTURE_DIRECTORY / "filename_filter", root)
    touch_tree(root, FROZEN_NOW)
    perform(
        make_source(root, Store()),
        root,
        {"type": "write", "files": scenario["steps"][0]["action"]["files"]},
    )
    source = make_source(root, Store())
    source.scan()
    assert sorted(Path(path).name for path in source.files) == ROLLOUT_NAMES_KEPT


def test_session_tree_from_scan_and_poll_lists_the_kept_rollouts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    agents = final_agents("filename_filter", tmp_path, monkeypatch)
    assert [agent["name"] for agent in agents] == [
        "Orchestrator",
        "Good",
        "Bare",
        "Accent",
        "Depth four",
        "Edge of window",
    ]


def test_blocked_phase_names_the_pending_tool(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    [agent] = final_agents("blocked_approval", tmp_path, monkeypatch)
    assert agent["phases"] == [
        {
            "at": 3,
            "state": "blocked",
            "note": "Waiting for your approval to run shell npm test.",
        }
    ]


BLOCKED_NPM_TEST = [
    {
        "at": 3,
        "state": "blocked",
        "note": "Waiting for your approval to run shell npm test.",
    }
]


@pytest.mark.parametrize(
    ("name", "expected_phases", "tool_out"),
    [
        ("approval_type_array", None, "No result yet."),
        ("approval_without_ids", BLOCKED_NPM_TEST, "No result yet."),
        ("approval_resolved_without_ids", None, "ok"),
    ],
)
def test_approvals_match_calls_by_call_id(
    name: str,
    expected_phases: list | None,
    tool_out: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    [agent] = final_agents(name, tmp_path, monkeypatch)
    assert agent.get("phases") == expected_phases
    assert tool_rows(agent, "out") == [(tool_out,)]


def test_a_resolved_approval_leaves_no_phase(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    [agent] = final_agents("approval_resolved", tmp_path, monkeypatch)
    assert "phases" not in agent
    assert tool_rows(agent, "out", "pending") == [("ok", None)]


@pytest.mark.parametrize(
    ("name", "expected_phases"),
    [
        (
            "waiting_after_done",
            [
                {
                    "at": 3,
                    "state": "waiting",
                    "note": "Finished its turn. Waiting for your next message.",
                }
            ],
        ),
        (
            "waiting_done_one_second_early",
            [
                {
                    "at": 2,
                    "state": "waiting",
                    "note": "Finished its turn. Waiting for your next message.",
                }
            ],
        ),
        ("waiting_done_too_early", None),
        ("waiting_done_with_pending_tool", None),
    ],
)
def test_root_waiting_phase(
    name: str,
    expected_phases: list | None,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    [agent] = final_agents(name, tmp_path, monkeypatch)
    assert agent.get("phases") == expected_phases


def test_subagents_end_on_done_while_the_session_is_live(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    session = final_session("subagent_done_while_live", tmp_path, monkeypatch)
    assert session is not None
    assert session["live"] is True
    orchestrator, worker, idle, quiet = session["agents"]
    assert "end" not in orchestrator and "phases" not in orchestrator
    assert (worker["end"], worker["final"], worker["returned"]["summary"]) == (
        6,
        "complete",
        "Listed the files.",
    )
    assert "phases" not in worker
    assert idle["phases"] == [
        {
            "at": 9,
            "state": "blocked",
            "note": "Waiting for your approval to run shell rm -rf build.",
        }
    ]
    assert "end" not in idle and "end" not in quiet


@pytest.mark.parametrize(
    ("name", "live", "tool_out"),
    [
        ("pending_stale", True, "No result yet."),
        ("pending_expired", False, "No result was recorded."),
        ("pending_window_edge", False, "No result was recorded."),
        ("pending_window_inside", True, "No result yet."),
        ("live_window_edge", False, None),
        ("live_window_inside", True, None),
    ],
)
def test_liveness_windows(
    name: str,
    live: bool,
    tool_out: str | None,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    session = final_session(name, tmp_path, monkeypatch)
    assert session is not None
    assert session["live"] is live
    [agent] = session["agents"]
    assert ("end" in agent) is (not live)
    if tool_out is not None:
        assert tool_rows(agent, "out", "pending") == [
            (tool_out, True if live else None)
        ]


@pytest.mark.parametrize(
    ("name", "repo"),
    [
        ("repo_trailing_slash", "api (dev/x)"),
        ("repo_root_cwd", ""),
        ("repo_double_slashes", "web"),
        ("repo_numeric_branch", "web"),
        ("repo_numeric_cwd", ""),
        ("repo_no_cwd", ""),
    ],
)
def test_run_repo_uses_the_last_path_segment(
    name: str, repo: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    session = final_session(name, tmp_path, monkeypatch)
    assert session is not None
    assert session["run"]["repo"] == repo


def test_a_build_failure_is_logged_by_exception_type_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("HOME", str(tmp_path))
    root = tmp_path / "root"
    shutil.copytree(FIXTURE_DIRECTORY / "shell_output", root)
    touch_tree(root, FROZEN_NOW)

    def fail_to_build(_: SessionBuilder) -> None:
        raise RuntimeError("secret transcript text")

    monkeypatch.setattr(SessionBuilder, "build", fail_to_build)
    logged: list[str] = []
    store = Store()
    source = make_source(root, store, log=logged.append)
    source.scan()
    source.poll()
    assert store.sessions == {}
    assert len(logged) == 1
    assert logged[0].startswith("codex: could not build ")
    assert logged[0].endswith(": RuntimeError")
    assert "secret" not in logged[0]


def test_oversized_prompts_are_clipped_at_utf16_units(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    [agent] = final_agents("clip_units", tmp_path, monkeypatch)
    assert agent["task"] == "Hello " + "\U0001f600" * 3997 + "…"
    assert [turn["text"] for turn in agent["turns"]] == [
        "a" + "\U0001f600" * 3999 + "\ud83d…",
        "b" * 8000 + "…",
        "c " * 3999 + "c…",
        "d " * 2999 + "d…",
    ]


def test_ruser_text_is_clipped_with_the_utf16_boundary_rule():
    file_record = CodexFile("/tmp/clip.jsonl")
    text = "Hello " + "\U0001f600" * 4500 + " World"
    CodexIngester(file_record).ingest(
        {
            "type": "response_item",
            "payload": {
                "type": "message",
                "role": "user",
                "content": [{"text": text}],
            },
        },
    )
    [event] = file_record.events
    assert event.kind == "ruser"
    assert event.text == "Hello " + "\U0001f600" * 3997 + "…"


def test_the_clock_is_required():
    construct: Callable[..., CodexSource] = CodexSource
    with pytest.raises(TypeError):
        construct(roots=[], since_ms=DAY_MS, store=Store())


def test_roots_are_published_in_file_order(tmp_path: Path):
    root = tmp_path / "sessions"
    names = [f"s{index}" for index in range(8)]
    for name in reversed(names):
        write_jsonl(
            root / f"rollout-{name}.jsonl",
            [
                {
                    "timestamp": "2026-09-28T11:00:00.000Z",
                    "type": "session_meta",
                    "payload": {"id": name},
                }
            ],
        )
    touch_tree(root, FROZEN_NOW)
    store = Store()
    published: list[str] = []
    store.on_change(published.append)
    source = make_source(root, store)
    source.scan()
    source.poll()
    assert published == [f"codex:{name}" for name in names]


def test_a_shrunk_rollout_resets_events_and_times(tmp_path: Path):
    path = tmp_path / "rollout-shrink.jsonl"
    message = {
        "type": "event_msg",
        "payload": {"type": "user_message", "message": "first"},
    }
    write_jsonl(
        path,
        [
            {"timestamp": "2025-01-01T00:00:10Z", **message},
            {"timestamp": "2025-01-01T00:00:20Z", **message},
        ],
    )
    file_record = CodexFile(str(path))
    file_record.tail.read(
        lambda record: CodexIngester(file_record).ingest(record), file_record.reset
    )
    assert len(file_record.events) == 2
    write_jsonl(path, [{"timestamp": "2025-01-01T00:00:05Z", **message}])
    file_record.tail.read(
        lambda record: CodexIngester(file_record).ingest(record), file_record.reset
    )
    assert len(file_record.events) == 1
    assert file_record.first_ts == file_record.last_ts
    assert file_record.first_ts > 0
