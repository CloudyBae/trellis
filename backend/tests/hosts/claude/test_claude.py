import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path

import pytest

from tests.scenario_data import case_names, load_scenario
from tests.support.replay import (
    perform_polling_action,
    play_steps,
    touch_tree,
    write_jsonl,
)
from trellis.hosts.claude import ClaudeHookPayload, ClaudeSource
from trellis.hosts.claude import source as claude_source
from trellis.hosts.claude.build import repo_name
from trellis.hosts.claude.ingest import ClaudeIngester
from trellis.hosts.claude.records import TranscriptFile
from trellis.hosts.claude.source import (
    DEFAULT_BLOCKED_MESSAGE,
    needs_approval,
    tool_named_in,
)
from trellis.runtime.store import Store
from trellis.util.timestamps import timestamp_ms

TESTS_DIRECTORY = Path(__file__).resolve().parents[2]
FIXTURE_DIRECTORY = TESTS_DIRECTORY / "fixtures" / "claude"
PAYLOAD_DIRECTORY = TESTS_DIRECTORY / "payloads" / "claude"
CASES = case_names("claude")
FROZEN_NOW = load_scenario("claude", "finished")["now"]
DAY_MS = 86_400_000
SESSION_ID = "aaaaaaaa-0000"


def stamp(offset_seconds: float) -> str:
    moment = datetime.fromtimestamp(
        (FROZEN_NOW + offset_seconds * 1000) / 1000, tz=timezone.utc
    )
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def make_source(
    root: Path, store: Store, log=None, since_ms: float = DAY_MS
) -> ClaudeSource:
    return ClaudeSource(
        roots=[str(root)],
        since_ms=since_ms,
        store=store,
        log=log,
        clock=lambda: FROZEN_NOW,
    )


def user_record(offset_seconds: float, content: object, **extra: object) -> dict:
    return {
        "type": "user",
        "cwd": "/work/acme/api",
        "timestamp": stamp(offset_seconds),
        "message": {"role": "user", "content": content},
        **extra,
    }


def say_record(offset_seconds: float, text: str) -> dict:
    return {
        "type": "assistant",
        "cwd": "/work/acme/api",
        "timestamp": stamp(offset_seconds),
        "message": {"role": "assistant", "content": [{"type": "text", "text": text}]},
    }


def tool_record(offset_seconds: float, tool_id: str, name: str = "Read") -> dict:
    return {
        "type": "assistant",
        "cwd": "/work/acme/api",
        "timestamp": stamp(offset_seconds),
        "message": {
            "role": "assistant",
            "content": [
                {
                    "type": "tool_use",
                    "id": tool_id,
                    "name": name,
                    "input": {"file_path": "/work/acme/api/a.txt"},
                }
            ],
        },
    }


def project_file(root: Path, sid: str = SESSION_ID) -> Path:
    return root / "-work-acme-api" / f"{sid}.jsonl"


def session_dump(store: Store, sid: str = SESSION_ID) -> dict:
    return json.loads(store.json_of(f"cc:{sid}") or "null")


def run_records(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, records: list[object]
) -> dict:
    monkeypatch.setenv("HOME", str(tmp_path))
    root = tmp_path / "root"
    write_jsonl(project_file(root), records)
    touch_tree(root, FROZEN_NOW)
    store = Store()
    source = make_source(root, store)
    source.scan()
    source.poll()
    return session_dump(store)


def live_source(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, log=None
) -> tuple[ClaudeSource, Store, Path]:
    monkeypatch.setenv("HOME", str(tmp_path))
    root = tmp_path / "root"
    write_jsonl(
        project_file(root),
        [user_record(-60, "Write the release notes"), say_record(-10, "Drafted.")],
    )
    touch_tree(root, FROZEN_NOW)
    store = Store()
    source = make_source(root, store, log)
    source.scan()
    source.poll()
    return source, store, root


def perform(source: ClaudeSource, root: Path, action: dict) -> None:
    kind = action["type"]
    if kind == "append":
        with open(root / action["file"], "a", encoding="utf-8") as handle:
            handle.write(action["text"])
    elif kind == "hook":
        payload = json.loads(
            json.dumps(action["payload"]).replace("${root}", str(root))
        )
        source.hook(ClaudeHookPayload.model_validate(payload))
    elif not perform_polling_action(source, kind):
        raise AssertionError(kind)


def play_case(
    name: str, home: Path, monkeypatch: pytest.MonkeyPatch
) -> tuple[dict, list[dict | None]]:
    monkeypatch.setenv("HOME", str(home))
    scenario = load_scenario("claude", name)
    root = home / name
    shutil.copytree(FIXTURE_DIRECTORY / name, root)
    touch_tree(root, FROZEN_NOW)
    store = Store()
    source = ClaudeSource(
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


def final_agents(
    name: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> list[dict]:
    _, outputs = play_case(name, tmp_path, monkeypatch)
    last = outputs[-1]
    assert last is not None
    return last["agents"]


def test_base_fixture_agents_are_complete(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    agents = final_agents("finished", tmp_path, monkeypatch)
    assert [agent["completeness"] for agent in agents] == ["complete"] * 3


def test_a_root_without_a_prompt_but_with_messages_is_partial(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    [root] = final_agents("sentinel_root", tmp_path, monkeypatch)
    assert root["task"] == "No prompt was recorded."
    assert [turn["kind"] for turn in root["turns"]] == ["msg", "msg"]
    assert root["completeness"] == "partial"


def test_a_trimmed_agent_is_partial(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    [root] = final_agents("trimmed", tmp_path, monkeypatch)
    assert root["trimmed"] == 4
    assert len(root["turns"]) == 600
    assert root["completeness"] == "partial"


def test_a_meta_only_subagent_is_partial(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    root, meta_only = final_agents("meta_only", tmp_path, monkeypatch)
    assert meta_only["turns"] == []
    assert meta_only["task"] == "Audit the dependency list in package.json."
    assert meta_only["completeness"] == "partial"
    assert root["completeness"] == "complete"


def test_a_subagent_with_an_empty_meta_object_and_no_events_is_kept(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("HOME", str(tmp_path))
    root = tmp_path / "root"
    shutil.copytree(FIXTURE_DIRECTORY / "meta_only", root)
    [meta_file] = root.rglob("*.meta.json")
    results = {}
    for label, text in (("empty", "{}"), ("null", "null")):
        meta_file.write_text(text, "utf-8")
        touch_tree(root, FROZEN_NOW)
        store = Store()
        source = make_source(root, store)
        source.scan()
        source.poll()
        results[label] = json.loads(store.json_of("cc:dddddddd-4444") or "null")
    assert len(results["empty"]["agents"]) == 2
    assert results["empty"]["agents"][1]["completeness"] == "partial"
    assert len(results["null"]["agents"]) == 1


def test_agents_with_only_tool_calls_are_activity_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    root, orphan = final_agents("activity_only", tmp_path, monkeypatch)
    assert {turn["kind"] for turn in root["turns"]} == {"tool"}
    assert {turn["kind"] for turn in orphan["turns"]} == {"tool"}
    assert root["task"] == "No prompt was recorded."
    assert orphan["task"] == "No handoff was recorded."
    assert root["completeness"] == "activity_only"
    assert orphan["completeness"] == "activity_only"


def test_conversation_turns_are_counted_before_the_trim(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    records: list[object] = [say_record(-1000, "An early message.")]
    records += [tool_record(-900 + index, f"t{index}") for index in range(605)]
    session = run_records(tmp_path, monkeypatch, records)
    [root] = session["agents"]
    assert root["trimmed"] == 6
    assert {turn["kind"] for turn in root["turns"]} == {"tool"}
    assert root["completeness"] == "partial"


def test_the_timestamp_fallback_handles_empty_invalid_valid_and_non_string():
    assert timestamp_ms("") == 0
    assert timestamp_ms("not a date") == 0
    assert timestamp_ms("2026-09-28T12:00:07.000Z") == FROZEN_NOW + 7000
    assert timestamp_ms(1700000000000) == 0
    assert timestamp_ms(None) == 0
    assert timestamp_ms(["2026-09-28T12:00:07.000Z"]) == 0


def test_records_with_unusable_timestamps_do_not_move_the_session_bounds():
    file = TranscriptFile("/x/y.jsonl")
    for timestamp in ("", "not a date", 1700000000000, None):
        ClaudeIngester(file, True).ingest({"type": "assistant", "timestamp": timestamp})
    assert file.first_ts == 0 and file.last_ts == 0
    ClaudeIngester(file, True).ingest(
        {"type": "assistant", "timestamp": "2026-09-28T12:00:07.000Z"}
    )
    assert file.first_ts == file.last_ts == FROZEN_NOW + 7000


def test_half_second_offsets_round_up(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    session = run_records(
        tmp_path,
        monkeypatch,
        [
            user_record(0, "Prompt"),
            say_record(0.5, "half one"),
            say_record(2.5, "half three"),
        ],
    )
    assert [turn["at"] for turn in session["agents"][0]["turns"]] == [1, 3]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("permission needed", True),
        ("PERMISSION needed", True),
        ("please approve this", True),
        ("Approval requested", True),
        ("permiſſion needed", False),
        ("perm ission", False),
        ("appr", False),
        ("", False),
    ],
)
def test_approval_match_folds_only_ascii_case(text: str, expected: bool):
    assert needs_approval(text) is expected


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Claude needs your permission to use Bash", "Bash"),
        ("to use Bash﻿tail", "Bash"),
        ("to use Bash tail", "Bash"),
        ("to use Bash\x1cmore", "Bash\x1cmore"),
        ("to use Bash\x1fmore", "Bash\x1fmore"),
        ("to use  Bash", None),
        ("to use ﻿Bash", None),
        ("to use", None),
        ("no marker here", None),
        ("to use  first, to use second", "second"),
        ("", None),
    ],
)
def test_tool_name_uses_js_whitespace(message: str, expected: str | None):
    assert tool_named_in(message) == expected


def test_interrupt_detection_trims_like_javascript(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    session = run_records(
        tmp_path,
        monkeypatch,
        [
            user_record(0, "Real prompt"),
            user_record(1, [{"type": "text", "text": "[Request interrupted by user]"}]),
            user_record(2, "﻿[Request interrupted by user for tool use]"),
            user_record(3, "\x1c[Request interrupted by user]"),
            user_record(4, "Note: [Request interrupted by user] mid-sentence"),
            user_record(5, "[Request interrupted"),
        ],
    )
    texts = [turn["text"] for turn in session["agents"][0]["turns"]]
    assert texts == [
        "Interrupted.",
        "Interrupted.",
        "\x1c[Request interrupted by user]",
        "Note: [Request interrupted by user] mid-sentence",
        "[Request interrupted",
    ]


@pytest.mark.parametrize(
    ("cwd", "main_file", "expected"),
    [
        ("/work/acme/api/", "/root/-x/s.jsonl", "api"),
        ("/work/acme/api", "/root/-x/s.jsonl", "api"),
        ("/", "/root/-x/s.jsonl", ""),
        ("", "/root/-work-acme-web/s.jsonl", "web"),
        ("", "/root/plain/s.jsonl", "plain"),
        ("", "/root/-/s.jsonl", ""),
        ("", "/root/-a-b-/s.jsonl", ""),
        ("", "s.jsonl", "."),
    ],
)
def test_repo_name_follows_basename(cwd: str, main_file: str, expected: str):
    assert repo_name(cwd, main_file) == expected


def test_the_run_name_is_clipped_in_utf16_units(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    prompt = "a" * 79 + "\U0001f600" + " then more words to follow"
    session = run_records(tmp_path, monkeypatch, [user_record(0, prompt)])
    assert session["run"]["name"] == "a" * 79 + "\ud83d" + "…"


def test_title_records_are_matched_by_substring_of_the_type(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    session = run_records(
        tmp_path,
        monkeypatch,
        [
            user_record(0, "Prompt text"),
            {"type": "Title", "title": "Wrong case"},
            {"type": "subtitles", "title": "Matched"},
        ],
    )
    assert session["run"]["name"] == "Matched"
    other = run_records(
        tmp_path,
        monkeypatch,
        [user_record(0, "Prompt text"), {"type": "Title", "title": "Wrong case"}],
    )
    assert other["run"]["name"] == "Prompt text"


def test_subagent_ids_strip_only_a_leading_agent_prefix_and_trailing_extension(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("HOME", str(tmp_path))
    root = tmp_path / "root"
    write_jsonl(project_file(root), [user_record(-60, "Prompt")])
    subagents = root / "-work-acme-api" / SESSION_ID / "subagents"
    for name in ("agent-agent-x.jsonl", "plain.jsonl", "agent-a.jsonl.jsonl"):
        write_jsonl(subagents / name, [say_record(-30, "hello")])
    (subagents / "agent-notes.txt").write_text("skipped", "utf-8")
    touch_tree(root, FROZEN_NOW)
    source = make_source(root, Store())
    source.scan()
    [state] = source.sessions.values()
    assert sorted(state.subs) == ["a.jsonl", "agent-x", "plain"]
    assert state.subs["agent-x"].meta_file.endswith("agent-agent-x.meta.json")


def test_the_session_directory_drops_only_the_trailing_extension(tmp_path: Path):
    source = make_source(tmp_path, Store())
    state = source.ensure("s", "/p/a.jsonl.d/s.jsonl")
    assert state.dir == "/p/a.jsonl.d/s"


def test_scan_ignores_files_older_than_the_window(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("HOME", str(tmp_path))
    root = tmp_path / "root"
    write_jsonl(project_file(root), [user_record(-60, "Prompt")])
    stale = (FROZEN_NOW - 2 * DAY_MS) / 1000
    os.utime(project_file(root), (stale, stale))
    source = make_source(root, Store())
    source.scan()
    assert source.sessions == {}


def test_hook_without_a_session_id_changes_nothing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    source, store, _ = live_source(tmp_path, monkeypatch)
    before = store.json_of(f"cc:{SESSION_ID}")
    source.hook(ClaudeHookPayload())
    source.hook(ClaudeHookPayload(session_id="", hook_event_name="SessionEnd"))
    source.hook(ClaudeHookPayload(hook_event_name="SessionEnd"))
    assert list(source.sessions) == [SESSION_ID]
    assert source.sessions[SESSION_ID].ended is False
    assert store.json_of(f"cc:{SESSION_ID}") == before


def test_an_unknown_event_marks_the_session_as_hooked_and_republishes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    source, store, _ = live_source(tmp_path, monkeypatch)
    assert session_dump(store)["hooks"] is False
    source.hook(ClaudeHookPayload(session_id=SESSION_ID, hook_event_name="Bogus"))
    assert session_dump(store)["hooks"] is True
    assert source.sessions[SESSION_ID].ended is False


def test_a_hook_reads_and_republishes_only_its_own_session(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    source, store, root = live_source(tmp_path, monkeypatch)
    other_id = "bbbbbbbb-0000"
    write_jsonl(
        project_file(root, other_id),
        [user_record(-50, "Review the diff"), say_record(-5, "Reviewed.")],
    )
    touch_tree(root, FROZEN_NOW)
    source.scan()
    source.poll()
    reads: list[str] = []
    original_read = source.read

    def counting_read(file: TranscriptFile, is_main: bool) -> bool:
        reads.append(file.file)
        return original_read(file, is_main)

    monkeypatch.setattr(source, "read", counting_read)
    source.hook(
        ClaudeHookPayload(
            session_id=SESSION_ID,
            hook_event_name="PermissionRequest",
            tool_name="Bash",
        )
    )
    assert reads == [str(project_file(root))]
    assert session_dump(store)["hooks"] is True
    assert session_dump(store, other_id)["hooks"] is False


def test_an_unknown_session_without_a_transcript_path_is_ignored(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("HOME", str(tmp_path))
    store = Store()
    source = make_source(tmp_path / "root", store)
    source.hook(ClaudeHookPayload(session_id="unknown", hook_event_name="SessionStart"))
    assert source.sessions == {}
    assert store.list() == []


def test_an_unknown_session_with_a_transcript_path_is_created_and_scanned(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("HOME", str(tmp_path))
    root = tmp_path / "finished"
    shutil.copytree(FIXTURE_DIRECTORY / "finished", root)
    touch_tree(root, FROZEN_NOW)
    store = Store()
    source = make_source(tmp_path / "elsewhere", store)
    sid = "11111111-aaaa"
    transcript = root / "-work-acme-api" / f"{sid}.jsonl"
    source.hook(
        ClaudeHookPayload(
            session_id=sid,
            hook_event_name="SessionStart",
            transcript_path=str(transcript),
        )
    )
    assert sorted(source.sessions[sid].subs) == ["aaa", "bbb"]
    dumped = session_dump(store, sid)
    assert len(dumped["agents"]) == 3
    assert dumped["hooks"] is True


def test_an_empty_message_falls_back_to_the_default_note(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    source, store, _ = live_source(tmp_path, monkeypatch)
    source.hook(
        ClaudeHookPayload(
            session_id=SESSION_ID,
            hook_event_name="Notification",
            notification_type="permission_prompt",
            message="",
        )
    )
    [phase] = session_dump(store)["agents"][0]["phases"]
    assert phase["state"] == "blocked"
    assert phase["note"] == DEFAULT_BLOCKED_MESSAGE


def test_non_string_hook_fields_are_treated_as_not_provided(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    source, store, _ = live_source(tmp_path, monkeypatch)
    source.hook(ClaudeHookPayload(session_id=5, hook_event_name="SessionEnd"))
    source.hook(ClaudeHookPayload(session_id=[SESSION_ID], hook_event_name="Stop"))
    source.hook(ClaudeHookPayload(session_id={"a": 1}, transcript_path="x"))
    assert list(source.sessions) == [SESSION_ID]
    source.hook(
        ClaudeHookPayload(
            session_id=SESSION_ID,
            transcript_path=[],
            hook_event_name=7,
            notification_type={"a": 1},
            message=["x"],
            tool_name=3,
            agent_id=9,
        )
    )
    assert source.sessions[SESSION_ID].hook.seen is True
    assert source.sessions[SESSION_ID].hook.blocked is None
    source.hook(
        ClaudeHookPayload(
            session_id=SESSION_ID,
            hook_event_name="Notification",
            notification_type="permission_prompt",
            message=5,
            agent_id=9,
        )
    )
    [phase] = session_dump(store)["agents"][0]["phases"]
    assert phase["note"] == DEFAULT_BLOCKED_MESSAGE
    source.hook(
        ClaudeHookPayload(
            session_id=SESSION_ID, hook_event_name="PermissionRequest", tool_name=3
        )
    )
    blocked = source.sessions[SESSION_ID].hook.blocked
    assert blocked is not None
    assert blocked.message == DEFAULT_BLOCKED_MESSAGE
    assert blocked.tool is None


def test_a_hook_payload_accepts_extra_fields():
    payload = ClaudeHookPayload.model_validate(
        {"session_id": "s", "cwd": "/x", "prompt": "hi", "tool_input": {"a": 1}}
    )
    assert payload.session_id == "s"


class FailingStore(Store):
    def __init__(self) -> None:
        super().__init__()
        self.failing = True

    def put(self, session) -> None:
        if self.failing:
            raise RuntimeError("secret prompt text")
        super().put(session)


def test_a_failing_publish_is_logged_without_its_text_and_later_polls_still_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("HOME", str(tmp_path))
    root = tmp_path / "root"
    write_jsonl(project_file(root), [user_record(-60, "Prompt"), say_record(-10, "Hi")])
    touch_tree(root, FROZEN_NOW)
    store = FailingStore()
    logged: list[str] = []
    source = make_source(root, store, logged.append)
    source.scan()
    source.poll()
    assert logged == [f"claude: could not build {SESSION_ID}: RuntimeError"]
    assert store.list() == []
    store.failing = False
    with open(project_file(root), "a", encoding="utf-8") as handle:
        handle.write(json.dumps(say_record(-5, "More")) + "\n")
    source.poll()
    assert len(session_dump(store)["agents"][0]["turns"]) == 2
    assert len(logged) == 1


def test_a_failing_build_is_logged_by_exception_type_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    def broken_build(self):
        raise ValueError("secret prompt text")

    monkeypatch.setattr(claude_source.SessionBuilder, "build", broken_build)
    logged: list[str] = []
    source, store, _ = live_source(tmp_path, monkeypatch, logged.append)
    assert logged == [f"claude: could not build {SESSION_ID}: ValueError"]
    assert store.list() == []


def test_refresh_republishes_live_sessions_using_the_injected_clock(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    source, store, _ = live_source(tmp_path, monkeypatch)
    assert session_dump(store)["live"] is True
    source.clock = lambda: FROZEN_NOW + 30 * 60e3
    source.refresh()
    assert session_dump(store)["live"] is False


def test_a_shrunk_transcript_resets_events_times_title_and_prompt(tmp_path: Path):
    path = tmp_path / "shrink.jsonl"
    long_records = [
        {"type": "summary", "summary": "Old title"},
        {
            "type": "user",
            "timestamp": stamp(10),
            "message": {"role": "user", "content": "first prompt"},
        },
        {
            "type": "user",
            "timestamp": stamp(20),
            "message": {"role": "user", "content": "second prompt"},
        },
    ]
    write_jsonl(path, long_records)
    transcript = TranscriptFile(str(path))
    transcript.tail.read(ClaudeIngester(transcript, True).ingest, transcript.reset)
    assert len(transcript.events) == 2
    write_jsonl(
        path,
        [
            {
                "type": "user",
                "timestamp": stamp(5),
                "message": {"role": "user", "content": "x"},
            }
        ],
    )
    transcript.tail.read(ClaudeIngester(transcript, True).ingest, transcript.reset)
    assert [event.text for event in transcript.events] == ["x"]
    assert transcript.title == ""
    assert transcript.first_prompt == "x"
    assert transcript.first_ts == transcript.last_ts == timestamp_ms(stamp(5))


def test_non_string_tool_ids_are_treated_as_absent():
    file = TranscriptFile("/x/y.jsonl")
    ingester = ClaudeIngester(file, False)
    ingester.ingest(
        {
            "type": "assistant",
            "timestamp": stamp(1),
            "message": {
                "content": [{"type": "tool_use", "id": 7, "name": "Bash", "input": {}}]
            },
        }
    )
    ingester.ingest(
        {
            "type": "user",
            "timestamp": stamp(2),
            "message": {
                "content": [{"type": "tool_result", "tool_use_id": 7, "content": "ok"}]
            },
        }
    )
    assert [(event.kind, event.id) for event in file.events] == [
        ("use", None),
        ("result", None),
    ]
