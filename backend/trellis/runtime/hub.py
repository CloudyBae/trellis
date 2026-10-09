import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from ..util.json_text import js_json

FLUSH_DELAY_SECONDS = 0.25
PING_INTERVAL_SECONDS = 20.0

PublishedEvent = tuple[str, str]


def session_message(payload: str) -> str:
    return f"event: session\ndata: {payload}\n\n"


def remove_message(session_id: str) -> str:
    return f"event: remove\ndata: {js_json({'id': session_id})}\n\n"


@dataclass(eq=False)
class Subscription:
    queue: asyncio.Queue[str | None] = field(default_factory=asyncio.Queue)
    baseline: dict[str, str] = field(default_factory=dict)


class Hub:
    def __init__(
        self,
        *,
        flush_delay: float = FLUSH_DELAY_SECONDS,
        ping_interval: float = PING_INTERVAL_SECONDS,
    ) -> None:
        self.flush_delay = flush_delay
        self.ping_interval = ping_interval
        self.snapshot: list[str] = []
        self.pending: dict[str, str] = {}
        self.subscriptions: set[Subscription] = set()
        self.flush_handle: asyncio.TimerHandle | None = None

    def sessions_json(self) -> str:
        return "[" + ",".join(self.snapshot) + "]"

    def publish(self, events: list[PublishedEvent], snapshot: list[str]) -> None:
        self.snapshot = snapshot
        for session_id, message in events:
            self.pending[session_id] = message
        if self.pending and self.flush_handle is None:
            self.flush_handle = asyncio.get_running_loop().call_later(
                self.flush_delay, self.flush
            )

    def flush(self) -> None:
        self.flush_handle = None
        for session_id, message in self.pending.items():
            for subscription in self.subscriptions:
                if subscription.baseline.get(session_id) != message:
                    subscription.queue.put_nowait(message)
        self.pending.clear()
        for subscription in self.subscriptions:
            subscription.baseline.clear()

    async def stream(self) -> AsyncIterator[str]:
        subscription = Subscription(baseline=dict(self.pending))
        self.subscriptions.add(subscription)
        loop = asyncio.get_running_loop()
        try:
            yield f'event: hello\ndata: {{"sessions":{self.sessions_json()}}}\n\n'
            next_ping = loop.time() + self.ping_interval
            while True:
                try:
                    message = await asyncio.wait_for(
                        subscription.queue.get(), max(next_ping - loop.time(), 0)
                    )
                except TimeoutError:
                    next_ping = loop.time() + self.ping_interval
                    yield ": ping\n\n"
                    continue
                if message is None:
                    return
                yield message
        finally:
            self.subscriptions.discard(subscription)

    def close(self) -> None:
        if self.flush_handle is not None:
            self.flush_handle.cancel()
            self.flush_handle = None
        for subscription in self.subscriptions:
            subscription.queue.put_nowait(None)
