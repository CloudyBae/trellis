import copy
import json
import os
from collections.abc import Callable
from pathlib import Path
from typing import Protocol, TypeVar

from trellis.runtime.store import Store


class PollingSource(Protocol):
    def scan(self) -> None: ...

    def poll(self) -> None: ...

    def refresh(self) -> None: ...


SourceType = TypeVar("SourceType", bound=PollingSource)


def touch_tree(directory: Path, frozen_now: float) -> None:
    seconds = frozen_now / 1000
    for path in directory.rglob("*"):
        if path.is_file():
            os.utime(path, (seconds, seconds))


def write_jsonl(path: Path, records: list[object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(record) + "\n" for record in records), "utf-8")


def without_completeness(session: dict | None) -> dict | None:
    if session is None:
        return None
    stripped = copy.deepcopy(session)
    for agent in stripped["agents"]:
        del agent["completeness"]
    return stripped


def perform_polling_action(source: PollingSource, kind: str) -> bool:
    if kind == "scan_poll":
        source.scan()
        source.poll()
    elif kind == "poll":
        source.poll()
    elif kind == "refresh":
        source.refresh()
    else:
        return False
    return True


def play_steps(
    scenario: dict,
    source: SourceType,
    store: Store,
    root: Path,
    perform: Callable[[SourceType, Path, dict], None],
) -> list[dict | None]:
    outputs: list[dict | None] = []
    for step in scenario["steps"]:
        perform(source, root, step["action"])
        dumped = store.json_of(scenario["sessionId"])
        outputs.append(None if dumped is None else json.loads(dumped))
    return outputs
