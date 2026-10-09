import asyncio
import os
import shutil
import threading
import time
from pathlib import Path

import pytest

from tests.builders import NEVER_EVICT_MS, make_session
from tests.scenario_data import load_scenario
from trellis.hosts.claude import ClaudeSource
from trellis.otlp.bodies import RejectedBody
from trellis.otlp.source import OtlpSource
from trellis.runtime.hub import Hub, remove_message, session_message
from trellis.runtime.runtime import Runtime
from trellis.runtime.store import Store
from trellis.sessions.serialize import dump_session

FIXTURE_DIRECTORY = Path(__file__).resolve().parents[1] / "fixtures" / "claude"
FROZEN_NOW = load_scenario("claude", "finished")["now"]
DAY_MS = 86_400_000
BLOCKED_SESSION = "22222222-bbbb"
PERMISSION_HOOK = {
    "session_id": BLOCKED_SESSION,
    "hook_event_name": "Notification",
    "message": "Claude needs your permission to use Bash",
}
SETTLE_SECONDS = 5.0


class StubSource:
    def __init__(self, failing_poll: int) -> None:
        self.failing_poll = failing_poll
        self.polls = 0
        self.scans = 0
        self.refreshes = 0

    def scan(self) -> None:
        self.scans += 1

    def poll(self) -> None:
        self.polls += 1
        if self.polls == self.failing_poll:
            raise RuntimeError("synthetic failure")

    def refresh(self) -> None:
        self.refreshes += 1


def frozen_clock() -> float:
    return FROZEN_NOW


def make_runtime(
    sources: list | None = None, logs: list[str] | None = None, **options
) -> Runtime:
    store = Store()
    log = logs.append if logs is not None else (lambda message: None)
    return Runtime(
        store=store,
        sources=sources or [],
        otlp=OtlpSource(
            since_ms=NEVER_EVICT_MS, store=store, clock=frozen_clock, log=log
        ),
        source_names=[],
        log=log,
        **options,
    )


def claude_runtime(tmp_path: Path, logs: list[str]) -> tuple[Runtime, ClaudeSource]:
    root = tmp_path / "claude"
    shutil.copytree(FIXTURE_DIRECTORY / "live_blocked", root)
    for directory, _, names in os.walk(root):
        for name in names:
            os.utime(os.path.join(directory, name), (FROZEN_NOW / 1000,) * 2)
    store = Store()
    source = ClaudeSource(
        roots=[str(root)],
        since_ms=DAY_MS,
        store=store,
        log=logs.append,
        clock=frozen_clock,
    )
    runtime = Runtime(
        store=store,
        sources=[source],
        otlp=OtlpSource(
            since_ms=NEVER_EVICT_MS, store=store, clock=frozen_clock, log=logs.append
        ),
        source_names=["claude"],
        log=logs.append,
        hook_handler=source.hook,
    )
    return runtime, source


async def next_message(stream, timeout: float = SETTLE_SECONDS) -> str:
    return await asyncio.wait_for(anext(stream), timeout)


def test_update_published_before_connecting_arrives_once() -> None:
    first = '{"id":"a","v":1}'
    second = '{"id":"b","v":1}'

    async def scenario() -> None:
        hub = Hub(flush_delay=0.01)
        hub.publish([("a", session_message(first))], [first])
        stream = hub.stream()
        hello = await next_message(stream)
        assert hello == f'event: hello\ndata: {{"sessions":[{first}]}}\n\n'
        hub.publish([("b", session_message(second))], [second, first])
        assert await next_message(stream) == session_message(second)
        await asyncio.sleep(0.05)
        assert next(iter(hub.subscriptions)).queue.empty()
        await stream.aclose()

    asyncio.run(scenario())


def test_update_after_connecting_is_delivered_even_if_it_replaces_a_pending_one() -> (
    None
):
    before = '{"id":"a","v":1}'
    after = '{"id":"a","v":2}'

    async def scenario() -> None:
        hub = Hub(flush_delay=0.01)
        hub.publish([("a", session_message(before))], [before])
        stream = hub.stream()
        await next_message(stream)
        hub.publish([("a", session_message(after))], [after])
        assert await next_message(stream) == session_message(after)
        await stream.aclose()

    asyncio.run(scenario())


def test_burst_is_coalesced_to_the_latest_message_per_session() -> None:
    async def scenario() -> None:
        hub = Hub(flush_delay=0.02)
        stream = hub.stream()
        await next_message(stream)
        hub.publish([("a", session_message('{"id":"a","v":1}'))], [])
        hub.publish([("a", session_message('{"id":"a","v":2}'))], [])
        hub.publish([("b", session_message('{"id":"b","v":1}'))], [])
        hub.publish([("b", remove_message("b"))], [])
        assert await next_message(stream) == session_message('{"id":"a","v":2}')
        assert await next_message(stream) == 'event: remove\ndata: {"id":"b"}\n\n'
        await asyncio.sleep(0.05)
        assert next(iter(hub.subscriptions)).queue.empty()
        await stream.aclose()

    asyncio.run(scenario())


def test_idle_stream_sends_ping_comments_and_close_ends_it() -> None:
    async def scenario() -> None:
        hub = Hub(ping_interval=0.02)
        stream = hub.stream()
        await next_message(stream)
        assert await next_message(stream) == ": ping\n\n"
        assert await next_message(stream) == ": ping\n\n"
        hub.close()
        with pytest.raises(StopAsyncIteration):
            while True:
                await next_message(stream)
        assert not hub.subscriptions

    asyncio.run(scenario())


def test_disconnected_client_is_unsubscribed() -> None:
    async def scenario() -> None:
        hub = Hub()
        stream = hub.stream()
        await next_message(stream)
        assert len(hub.subscriptions) == 1
        await stream.aclose()
        assert not hub.subscriptions

    asyncio.run(scenario())


def test_store_changes_reach_the_hub_with_an_ordered_listing() -> None:
    older = make_session("cc:old", "old", t0=1)
    newer = make_session("cc:new", "new", t0=2)

    async def scenario() -> None:
        runtime = make_runtime()
        await runtime.run(runtime.store.put, older)
        await runtime.run(runtime.store.put, newer)
        assert runtime.hub.snapshot == [dump_session(newer), dump_session(older)]
        assert runtime.hub.pending == {
            "cc:old": session_message(dump_session(older)),
            "cc:new": session_message(dump_session(newer)),
        }
        assert runtime.session_count() == 2

    asyncio.run(scenario())


def test_transcript_arrival_removes_the_otel_session_from_listing_and_events() -> None:
    otel = make_session("otel:x", "x", t0=1, via="traces")
    transcript = make_session("cc:x", "x", t0=2)

    async def scenario() -> None:
        runtime = make_runtime()
        await runtime.run(runtime.store.put, otel)
        await runtime.run(runtime.store.put, transcript)
        assert runtime.hub.snapshot == [dump_session(transcript)]
        assert runtime.hub.pending["otel:x"] == remove_message("otel:x")

    asyncio.run(scenario())


def test_events_of_a_failing_job_are_still_published() -> None:
    session = make_session("cc:1", "1")

    def put_then_fail() -> None:
        runtime.store.put(session)
        raise ValueError("after the first write")

    async def scenario() -> None:
        with pytest.raises(ValueError):
            await runtime.run(put_then_fail)
        assert runtime.hub.snapshot == [dump_session(session)]

    runtime = make_runtime()
    asyncio.run(scenario())


def test_jobs_run_one_at_a_time_in_submission_order() -> None:
    order: list[int] = []
    active = 0
    overlaps = 0
    guard = threading.Lock()

    def job(number: int) -> None:
        nonlocal active, overlaps
        with guard:
            active += 1
            overlaps += active > 1
        time.sleep(0.005)
        order.append(number)
        with guard:
            active -= 1

    async def scenario() -> None:
        runtime = make_runtime()
        await asyncio.gather(*(runtime.run(job, number) for number in range(12)))

    asyncio.run(scenario())
    assert order == list(range(12))
    assert overlaps == 0


def test_a_hook_between_two_polls_gives_the_same_session_as_running_them_in_order(
    tmp_path: Path,
) -> None:
    sequential_runtime, sequential_source = claude_runtime(tmp_path, [])
    sequential_runtime.scan_and_poll()
    sequential_source.poll()
    sequential_runtime.accept_hook(PERMISSION_HOOK)
    sequential_source.poll()
    expected = sequential_runtime.store.json_of(f"cc:{BLOCKED_SESSION}")
    assert expected is not None
    assert '"state":"blocked"' in expected
    shutil.rmtree(tmp_path / "claude")

    async def scenario() -> tuple[str | None, Runtime]:
        runtime, source = claude_runtime(tmp_path, [])
        await runtime.run(runtime.scan_and_poll)
        await asyncio.gather(
            runtime.run(source.poll),
            runtime.run(runtime.accept_hook, PERMISSION_HOOK),
            runtime.run(source.poll),
        )
        return runtime.store.json_of(f"cc:{BLOCKED_SESSION}"), runtime

    actual, runtime = asyncio.run(scenario())
    assert actual == expected
    assert runtime.hub.pending[f"cc:{BLOCKED_SESSION}"] == session_message(expected)
    assert runtime.hub.snapshot == [expected]


def test_a_source_that_raises_does_not_stop_the_next_tick_and_the_error_is_logged() -> (
    None
):
    source = StubSource(failing_poll=2)
    logs: list[str] = []

    async def scenario() -> None:
        runtime = make_runtime([source], logs, poll_interval=0.005, scan_interval=0.005)
        await runtime.start()
        while source.polls < 3 or source.refreshes < 1:
            await asyncio.wait_for(asyncio.sleep(0.005), SETTLE_SECONDS)
        await runtime.stop()

    asyncio.run(scenario())
    assert source.scans >= 2
    assert logs == ["StubSource.poll failed: RuntimeError"]


def test_initial_scan_and_poll_failure_is_logged_and_other_sources_still_run() -> None:
    failing = StubSource(failing_poll=1)
    healthy = StubSource(failing_poll=0)
    logs: list[str] = []

    async def scenario() -> None:
        runtime = make_runtime([failing, healthy], logs, poll_interval=3600)
        await runtime.start()
        await runtime.stop()

    asyncio.run(scenario())
    assert (healthy.scans, healthy.polls) == (1, 1)
    assert logs == ["Runtime.scan_and_poll_source failed: RuntimeError"]


def test_hooks_ignore_non_object_bodies_and_reject_null() -> None:
    runtime, _ = claude_runtime_without_files()
    for body in ([1], "text", 5, True):
        runtime.accept_hook(body)
    with pytest.raises(RejectedBody) as rejected:
        runtime.accept_hook(None)
    assert rejected.value.message == "body must be a JSON object or array"
    assert make_runtime().accept_hook(None) is None


def claude_runtime_without_files() -> tuple[Runtime, ClaudeSource]:
    store = Store()
    source = ClaudeSource(roots=[], since_ms=DAY_MS, store=store, clock=frozen_clock)
    runtime = Runtime(
        store=store,
        sources=[source],
        otlp=OtlpSource(since_ms=NEVER_EVICT_MS, store=store, clock=frozen_clock),
        source_names=["claude"],
        log=lambda message: None,
        hook_handler=source.hook,
    )
    return runtime, source


def test_a_failing_publish_does_not_stop_the_timer_loop() -> None:
    logs: list[str] = []

    class FlakyHub(Hub):
        failures = 0

        def publish(self, events, snapshot) -> None:
            if self.failures:
                self.failures -= 1
                raise RuntimeError("synthetic publish failure")
            super().publish(events, snapshot)

    store = Store()

    class PuttingSource(StubSource):
        def poll(self) -> None:
            super().poll()
            store.put(make_session(f"cc:{self.polls}", str(self.polls), t0=self.polls))

    source = PuttingSource(failing_poll=0)

    async def scenario() -> None:
        runtime = Runtime(
            store=store,
            sources=[source],
            otlp=OtlpSource(
                since_ms=NEVER_EVICT_MS,
                store=store,
                clock=frozen_clock,
                log=logs.append,
            ),
            source_names=[],
            log=logs.append,
            poll_interval=0.005,
            scan_interval=3600,
            hub=FlakyHub(),
        )
        await runtime.start()
        runtime.hub.failures = 1

        async def until_four_polls() -> None:
            while source.polls < 4:
                await asyncio.sleep(0.005)

        try:
            await asyncio.wait_for(until_four_polls(), SETTLE_SECONDS)
        finally:
            await runtime.stop()

    asyncio.run(scenario())
    assert logs == ["Runtime.poll_all failed: RuntimeError"]
