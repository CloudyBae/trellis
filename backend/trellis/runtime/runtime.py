import asyncio
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from functools import partial
from typing import ParamSpec

from pydantic import ValidationError

from ..hosts.claude import ClaudeHookPayload
from ..otlp.bodies import LogsBody, RejectedBody, TracesBody
from ..otlp.source import OtlpSource
from .hub import Hub, PublishedEvent, remove_message, session_message
from .sources import Log, TranscriptSource
from .store import Store

Params = ParamSpec("Params")

POLL_INTERVAL_SECONDS = 1.0
SCAN_INTERVAL_SECONDS = 5.0
NULL_BODY_MESSAGE = "body must be a JSON object or array"
SHAPE_MESSAGE = "body does not match the expected shape"


@dataclass
class JobOutcome:
    result: object = None
    error: Exception | None = None
    events: list[PublishedEvent] = field(default_factory=list)
    snapshot: list[str] = field(default_factory=list)


class Runtime:
    def __init__(
        self,
        *,
        store: Store,
        sources: Sequence[TranscriptSource],
        otlp: OtlpSource,
        source_names: Sequence[str],
        log: Log,
        poll_interval: float = POLL_INTERVAL_SECONDS,
        scan_interval: float = SCAN_INTERVAL_SECONDS,
        hub: Hub | None = None,
        hook_handler: Callable[[ClaudeHookPayload], None] | None = None,
    ) -> None:
        self.store = store
        self.sources = list(sources)
        self.otlp = otlp
        self.source_names = list(source_names)
        self.log = log
        self.poll_interval = poll_interval
        self.scan_interval = scan_interval
        self.hub = hub if hub is not None else Hub()
        self.hook_handler = hook_handler
        self.executor = ThreadPoolExecutor(max_workers=1)
        self.events: list[PublishedEvent] = []
        self.tasks: list[asyncio.Task[None]] = []
        store.on_change(self.record_change)
        store.on_remove(self.record_remove)

    def record_change(self, session_id: str) -> None:
        payload = self.store.json_of(session_id)
        if payload is not None:
            self.events.append((session_id, session_message(payload)))

    def record_remove(self, session_id: str) -> None:
        self.events.append((session_id, remove_message(session_id)))

    def listing(self) -> list[str]:
        return [self.store.json_of(session.id) or "" for session in self.store.list()]

    def run_job(
        self,
        function: Callable[Params, object],
        *args: Params.args,
        **kwargs: Params.kwargs,
    ) -> JobOutcome:
        self.events = []
        outcome = JobOutcome()
        try:
            outcome.result = function(*args, **kwargs)
        except Exception as error:
            outcome.error = error
        outcome.events = self.events
        self.events = []
        if outcome.events:
            outcome.snapshot = self.listing()
        return outcome

    async def run(
        self,
        function: Callable[Params, object],
        *args: Params.args,
        **kwargs: Params.kwargs,
    ) -> object:
        loop = asyncio.get_running_loop()
        outcome = await loop.run_in_executor(
            self.executor, partial(self.run_job, function, *args, **kwargs)
        )
        if outcome.events:
            self.hub.publish(outcome.events, outcome.snapshot)
        if outcome.error is not None:
            raise outcome.error
        return outcome.result

    def guarded(self, function: Callable[..., None], *args: object) -> None:
        try:
            function(*args)
        except Exception as error:
            self.log(f"{function.__qualname__} failed: {type(error).__name__}")

    def scan_and_poll(self) -> None:
        for source in self.sources:
            self.guarded(self.scan_and_poll_source, source)

    @staticmethod
    def scan_and_poll_source(source: TranscriptSource) -> None:
        source.scan()
        source.poll()

    def poll_all(self) -> None:
        for source in self.sources:
            self.guarded(source.poll)

    def scan_all(self) -> None:
        for source in self.sources:
            self.guarded(source.scan)

    def refresh_all(self) -> None:
        for source in self.sources:
            self.guarded(source.refresh)
        self.guarded(self.otlp.refresh)

    def session_count(self) -> int:
        return len(self.hub.snapshot)

    async def start(self) -> None:
        await self.run(self.scan_and_poll)
        self.tasks = [
            asyncio.create_task(self.every(self.poll_interval, self.poll_all)),
            asyncio.create_task(self.every(self.scan_interval, self.scan_all)),
            asyncio.create_task(self.every(self.scan_interval, self.refresh_all)),
        ]

    async def every(self, interval: float, function: Callable[[], None]) -> None:
        while True:
            await asyncio.sleep(interval)
            try:
                await self.run(function)
            except Exception as error:
                self.log(f"{function.__qualname__} failed: {type(error).__name__}")

    async def stop(self) -> None:
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        self.tasks = []
        self.hub.close()
        self.executor.shutdown(wait=False, cancel_futures=True)

    def accept_traces(self, body: object) -> None:
        self.otlp.accept_traces(self.traces_body(body))

    def accept_logs(self, body: object) -> None:
        self.otlp.accept_logs(self.logs_body(body))

    @staticmethod
    def traces_body(body: object) -> TracesBody:
        if body is None:
            raise RejectedBody(NULL_BODY_MESSAGE)
        if not isinstance(body, dict):
            return TracesBody()
        try:
            return TracesBody.model_validate(body)
        except ValidationError as error:
            raise RejectedBody(SHAPE_MESSAGE) from error

    @staticmethod
    def logs_body(body: object) -> LogsBody:
        if body is None:
            raise RejectedBody(NULL_BODY_MESSAGE)
        if not isinstance(body, dict):
            return LogsBody()
        try:
            return LogsBody.model_validate(body)
        except ValidationError as error:
            raise RejectedBody(SHAPE_MESSAGE) from error

    def accept_hook(self, body: object) -> None:
        if self.hook_handler is None:
            return
        if body is None:
            raise RejectedBody(NULL_BODY_MESSAGE)
        if isinstance(body, dict):
            try:
                payload = ClaudeHookPayload.model_validate(body)
            except ValidationError as error:
                raise RejectedBody(SHAPE_MESSAGE) from error
            self.hook_handler(payload)
