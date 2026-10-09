import asyncio
import json
import os
from pathlib import Path

from tests.builders import make_session
from tests.support.otlp_replay import BASE_MS, SECOND, generated_body
from tests.support.replay import write_jsonl
from trellis.hosts.claude import ClaudeHookPayload, ClaudeSource
from trellis.hosts.codex import CodexSource
from trellis.hosts.copilot import CopilotSource
from trellis.otlp.source import OtlpSource
from trellis.runtime.hub import remove_message
from trellis.runtime.runtime import Runtime
from trellis.runtime.store import Store

NOW = 1_790_596_800_000.0
HOUR_MS = 3_600_000
WINDOW_MS = 24 * HOUR_MS
OLD_SECONDS = (NOW - 2 * WINDOW_MS) / 1000
FRESH_SECONDS = NOW / 1000
OTLP_NOW = float(BASE_MS + 10 * SECOND)


class Ticker:
    def __init__(self, now: float) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def make_runtime(clock: Ticker, *sources) -> tuple[Runtime, Store]:
    store = Store()
    runtime = Runtime(
        store=store,
        sources=[build(store, clock) for build in sources],
        otlp=OtlpSource(since_ms=WINDOW_MS, store=store, clock=clock),
        source_names=[],
        log=lambda message: None,
        hook_handler=None,
    )
    return runtime, store


def tick(runtime: Runtime) -> list[str]:
    outcome = runtime.run_job(runtime.refresh_all)
    assert outcome.error is None
    return [message for _, message in outcome.events]


def scan_tick(runtime: Runtime) -> list[str]:
    outcome = runtime.run_job(runtime.scan_and_poll)
    assert outcome.error is None
    return [message for _, message in outcome.events]


def set_mtime(path: Path, seconds: float) -> None:
    os.utime(path, (seconds, seconds))


def claude_record(kind: str, text: str, timestamp: str | None) -> dict:
    content = text if kind == "user" else [{"type": "text", "text": text}]
    record: dict = {
        "type": kind,
        "cwd": "/work/a",
        "message": {
            "role": kind if kind == "user" else "assistant",
            "content": content,
        },
    }
    if timestamp is not None:
        record["timestamp"] = timestamp
    return record


def claude_builder(root: Path):
    def build(store: Store, clock: Ticker) -> ClaudeSource:
        return ClaudeSource(
            roots=[str(root)], since_ms=WINDOW_MS, store=store, clock=clock
        )

    return build


def write_claude(root: Path, sid: str, timestamp: str | None = "2026-09-28T11:00:00Z"):
    path = root / "-work-a" / f"{sid}.jsonl"
    write_jsonl(
        path,
        [
            claude_record("user", "Do it", timestamp),
            claude_record("assistant", "Done", timestamp),
        ],
    )
    return path


def test_claude_session_past_the_window_is_removed_and_stays_removed(tmp_path: Path):
    root = tmp_path / "claude"
    path = write_claude(root, "old")
    set_mtime(path, FRESH_SECONDS)
    clock = Ticker(NOW)
    runtime, store = make_runtime(clock, claude_builder(root))
    source = runtime.sources[0]
    assert isinstance(source, ClaudeSource)
    scan_tick(runtime)
    assert store.get("cc:old") is not None
    assert tick(runtime) == []
    clock.now = NOW + 2 * WINDOW_MS
    assert tick(runtime) == [remove_message("cc:old")]
    assert store.get("cc:old") is None
    assert store.json_of("cc:old") is None
    assert source.sessions == {}
    assert tick(runtime) == []
    assert scan_tick(runtime) == []
    assert source.sessions == {}
    assert tick(runtime) == []


def test_claude_session_with_a_fresh_file_but_old_or_missing_event_times_is_kept(
    tmp_path: Path,
):
    root = tmp_path / "claude"
    set_mtime(write_claude(root, "old-times", "2020-01-01T00:00:00Z"), FRESH_SECONDS)
    set_mtime(write_claude(root, "no-times", None), FRESH_SECONDS)
    runtime, store = make_runtime(Ticker(NOW), claude_builder(root))
    scan_tick(runtime)
    for _ in range(3):
        assert remove_message("cc:old-times") not in tick(runtime)
        assert remove_message("cc:no-times") not in tick(runtime)
        assert remove_message("cc:old-times") not in scan_tick(runtime)
        assert remove_message("cc:no-times") not in scan_tick(runtime)
    source = runtime.sources[0]
    assert isinstance(source, ClaudeSource)
    assert set(source.sessions) == {"old-times", "no-times"}
    assert store.get("cc:old-times") is not None


def test_claude_session_with_a_fresh_subagent_file_is_kept(tmp_path: Path):
    root = tmp_path / "claude"
    path = write_claude(root, "parent")
    subagent = path.with_suffix("") / "subagents" / "agent-w1.jsonl"
    write_jsonl(subagent, [claude_record("user", "Sub", "2026-09-28T11:00:00Z")])
    set_mtime(path, OLD_SECONDS)
    set_mtime(subagent, FRESH_SECONDS)
    runtime, store = make_runtime(Ticker(NOW), claude_builder(root))
    source = runtime.sources[0]
    assert isinstance(source, ClaudeSource)
    source.sessions["parent"] = source.ensure("parent", str(path))
    source.scan_subs(source.sessions["parent"])
    assert tick(runtime) == []
    assert "parent" in source.sessions


def test_hook_created_session_without_a_transcript_is_kept_then_evicted_once(
    tmp_path: Path,
):
    clock = Ticker(NOW)
    root = tmp_path / "claude"
    runtime, store = make_runtime(clock, claude_builder(root))
    source = runtime.sources[0]
    assert isinstance(source, ClaudeSource)
    runtime.hook_handler = source.hook
    runtime.run_job(
        runtime.accept_hook,
        {
            "session_id": "ghost",
            "transcript_path": str(root / "-work-a" / "ghost.jsonl"),
            "hook_event_name": "SessionStart",
        },
    )
    assert "ghost" in source.sessions
    clock.now = NOW + WINDOW_MS - HOUR_MS
    assert tick(runtime) == []
    assert "ghost" in source.sessions
    clock.now = NOW + WINDOW_MS + HOUR_MS
    store.put(make_session("cc:ghost", "ghost"))
    assert tick(runtime) == [remove_message("cc:ghost")]
    assert source.sessions == {}
    assert tick(runtime) == []
    assert tick(runtime) == []


def test_removing_a_hook_only_session_that_never_reached_the_store_is_silent(
    tmp_path: Path,
):
    clock = Ticker(NOW)
    runtime, _ = make_runtime(clock, claude_builder(tmp_path / "claude"))
    source = runtime.sources[0]
    assert isinstance(source, ClaudeSource)
    source.hook(
        ClaudeHookPayload(
            session_id="ghost", transcript_path=str(tmp_path / "ghost.jsonl")
        )
    )
    clock.now = NOW + 2 * WINDOW_MS
    assert tick(runtime) == []
    assert source.sessions == {}


def codex_builder(root: Path):
    def build(store: Store, clock: Ticker) -> CodexSource:
        return CodexSource(
            roots=[str(root)], since_ms=WINDOW_MS, store=store, clock=clock
        )

    return build


def write_rollout(root: Path, name: str, sid: str, parent: str | None = None) -> Path:
    path = root / f"rollout-{name}.jsonl"
    payload: dict = {"id": sid}
    if parent is not None:
        payload["parent_id"] = parent
    write_jsonl(
        path,
        [
            {
                "timestamp": "2026-09-28T10:00:00.000Z",
                "type": "session_meta",
                "payload": payload,
            },
            {
                "timestamp": "2026-09-28T10:00:01.000Z",
                "type": "event_msg",
                "payload": {"type": "user_message", "message": "Go"},
            },
        ],
    )
    return path


def test_codex_session_past_the_window_is_removed_and_stays_removed(tmp_path: Path):
    root = tmp_path / "codex"
    for path in (write_rollout(root, "a", "a"), write_rollout(root, "b", "b")):
        set_mtime(path, FRESH_SECONDS)
    clock = Ticker(NOW)
    runtime, store = make_runtime(clock, codex_builder(root))
    source = runtime.sources[0]
    assert isinstance(source, CodexSource)
    scan_tick(runtime)
    assert store.get("codex:a") is not None
    set_mtime(root / "rollout-a.jsonl", OLD_SECONDS)
    assert tick(runtime) == [remove_message("codex:a")]
    assert store.get("codex:a") is None
    assert store.get("codex:b") is not None
    assert [file.sid for file in source.files.values()] == ["b"]
    assert tick(runtime) == []
    assert scan_tick(runtime) == []
    assert tick(runtime) == []


def test_codex_root_past_the_window_with_a_fresh_child_is_kept(tmp_path: Path):
    root = tmp_path / "codex"
    parent_path = write_rollout(root, "root", "root")
    child_path = write_rollout(root, "child", "child", parent="root")
    set_mtime(parent_path, FRESH_SECONDS)
    set_mtime(child_path, FRESH_SECONDS)
    clock = Ticker(NOW)
    runtime, store = make_runtime(clock, codex_builder(root))
    source = runtime.sources[0]
    assert isinstance(source, CodexSource)
    scan_tick(runtime)
    set_mtime(parent_path, OLD_SECONDS)
    assert tick(runtime) == []
    assert len(source.files) == 2
    assert store.get("codex:root") is not None
    clock.now = NOW + 2 * WINDOW_MS
    assert tick(runtime) == [remove_message("codex:root")]
    assert source.files == {}


def copilot_builder(root: Path):
    def build(store: Store, clock: Ticker) -> CopilotSource:
        return CopilotSource(
            roots=[str(root)], since_ms=WINDOW_MS, store=store, clock=clock
        )

    return build


def write_chat(root: Path, name: str) -> Path:
    path = root / "globalStorage" / "emptyWindowChatSessions" / f"{name}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "version": 3,
                "sessionId": name,
                "creationDate": 1790596740000,
                "requests": [
                    {
                        "requestId": "r1",
                        "timestamp": 1790596740000,
                        "message": {"text": "Hello"},
                        "result": {"timings": {"totalElapsed": 5000}},
                        "response": [],
                    }
                ],
            }
        ),
        "utf-8",
    )
    return path


def test_copilot_session_past_the_window_is_removed_and_stays_removed(tmp_path: Path):
    root = tmp_path / "vscode"
    old_path = write_chat(root, "old")
    fresh_path = write_chat(root, "fresh")
    set_mtime(old_path, FRESH_SECONDS)
    set_mtime(fresh_path, FRESH_SECONDS)
    clock = Ticker(NOW)
    runtime, store = make_runtime(clock, copilot_builder(root))
    source = runtime.sources[0]
    assert isinstance(source, CopilotSource)
    scan_tick(runtime)
    assert store.get("copilot:old") is not None
    assert store.get("copilot:fresh") is not None
    set_mtime(old_path, OLD_SECONDS)
    assert tick(runtime) == [remove_message("copilot:old")]
    assert store.get("copilot:old") is None
    assert store.get("copilot:fresh") is not None
    assert list(source.meta) == [str(fresh_path)]
    assert tick(runtime) == []
    assert scan_tick(runtime) == []
    assert tick(runtime) == []


def shift_spans(body: dict, offset_ms: int) -> dict:
    for span in body["resourceSpans"][0]["scopeSpans"][0]["spans"]:
        span["startTimeUnixNano"] = str(
            int(span["startTimeUnixNano"]) + offset_ms * 1_000_000
        )
        span["endTimeUnixNano"] = str(
            int(span["endTimeUnixNano"]) + offset_ms * 1_000_000
        )
    return body


def test_otlp_sessions_are_evicted_by_received_time_not_by_span_time():
    clock = Ticker(OTLP_NOW)
    runtime, store = make_runtime(clock)
    old_spans = shift_spans(
        generated_body({"kind": "spans", "session": "old", "from": 0, "to": 1}),
        -30 * 24 * HOUR_MS,
    )
    runtime.run_job(runtime.accept_traces, old_spans)
    runtime.run_job(
        runtime.accept_logs,
        generated_body({"kind": "records", "session": "logs", "from": 0, "to": 1}),
    )
    bare_spans = generated_body(
        {"kind": "spans", "session": "bare", "from": 0, "to": 1}
    )
    span = bare_spans["resourceSpans"][0]["scopeSpans"][0]["spans"][0]
    del span["startTimeUnixNano"]
    del span["endTimeUnixNano"]
    runtime.run_job(runtime.accept_traces, bare_spans)
    ids = {"otel:old", "otel:bare", "otel-log:logs"}
    present_before = set(store.sessions)
    assert present_before == ids
    for step in range(1, 4):
        clock.now = OTLP_NOW + step * HOUR_MS
        assert tick(runtime) == []
    assert set(store.sessions) == present_before
    clock.now = OTLP_NOW + WINDOW_MS + HOUR_MS
    removed = tick(runtime)
    assert sorted(removed) == sorted(
        remove_message(session_id) for session_id in present_before
    )
    assert store.sessions == {}
    assert runtime.otlp.traces == {}
    assert runtime.otlp.logs == {}
    assert tick(runtime) == []


def test_otlp_data_received_inside_the_window_keeps_the_session():
    clock = Ticker(OTLP_NOW)
    runtime, store = make_runtime(clock)
    runtime.run_job(
        runtime.accept_traces,
        generated_body({"kind": "spans", "session": "s", "from": 0, "to": 1}),
    )
    clock.now = OTLP_NOW + WINDOW_MS - HOUR_MS
    runtime.run_job(
        runtime.accept_traces,
        generated_body({"kind": "spans", "session": "s", "from": 1, "to": 2}),
    )
    clock.now = OTLP_NOW + WINDOW_MS + HOUR_MS
    assert tick(runtime) == []
    assert list(store.sessions) == ["otel:s"]


def test_runtime_publishes_remove_to_the_hub_for_an_evicted_otlp_session():
    clock = Ticker(OTLP_NOW)
    runtime, _ = make_runtime(clock)

    async def scenario() -> None:
        await runtime.run(
            runtime.accept_traces,
            generated_body({"kind": "spans", "session": "s", "from": 0, "to": 1}),
        )
        assert runtime.hub.snapshot
        session_id = next(iter(runtime.hub.pending))
        clock.now = OTLP_NOW + WINDOW_MS + HOUR_MS
        await runtime.run(runtime.refresh_all)
        assert runtime.hub.pending[session_id] == remove_message(session_id)
        assert runtime.hub.snapshot == []

    asyncio.run(scenario())


def test_evicting_a_transcript_session_reveals_its_hidden_otlp_twin():
    store = Store()
    changed: list[str] = []
    removed: list[str] = []
    store.on_change(changed.append)
    store.on_remove(removed.append)
    store.put(make_session("otel:x", "x", t0=1, via="traces"))
    store.put(make_session("cc:x", "x", t0=2))
    assert [session.id for session in store.list()] == ["cc:x"]
    changed.clear()
    removed.clear()
    store.remove("cc:x")
    assert removed == ["cc:x"]
    assert changed == ["otel:x"]
    assert [session.id for session in store.list()] == ["otel:x"]


def test_removing_an_unknown_session_is_a_no_op():
    store = Store()
    removed: list[str] = []
    changed: list[str] = []
    store.on_remove(removed.append)
    store.on_change(changed.append)
    store.remove("cc:missing")
    assert removed == [] and changed == []
