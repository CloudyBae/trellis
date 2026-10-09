import os
import time
from collections.abc import Iterator

import pytest

os.environ["TZ"] = "UTC"
time.tzset()


@pytest.fixture(autouse=True)
def pinned_time_zone() -> Iterator[None]:
    os.environ["TZ"] = "UTC"
    time.tzset()
    yield
    os.environ["TZ"] = "UTC"
    time.tzset()


@pytest.fixture
def use_time_zone(monkeypatch: pytest.MonkeyPatch):
    def apply(zone: str) -> None:
        monkeypatch.setenv("TZ", zone)
        time.tzset()

    return apply


@pytest.fixture
def synthetic_home(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setenv("HOME", "/home/synthetic")
    return "/home/synthetic"
