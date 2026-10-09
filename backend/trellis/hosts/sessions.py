from typing import TypeVar

from ..sessions.constants import LIVE_MS, REFRESH_GRACE_MS
from ..util.limits import MAX_TURNS
from .constants import LIVE_PENDING_MS

Item = TypeVar("Item")


def trim_turns(turns: list[Item]) -> int:
    dropped = max(0, len(turns) - MAX_TURNS)
    del turns[:dropped]
    return dropped


def is_live(now: float, last_ts: float, pending: bool) -> bool:
    return now - last_ts < LIVE_MS or (pending and now - last_ts < LIVE_PENDING_MS)


def is_refreshable(now: float, last_ts: float, live_window_ms: float) -> bool:
    return now - last_ts < live_window_ms + REFRESH_GRACE_MS


def final_state(last_error_ts: float | None, last_say_ts: float | None) -> str:
    failed = last_error_ts is not None and (
        last_say_ts is None or last_error_ts > last_say_ts
    )
    return "failed" if failed else "complete"
