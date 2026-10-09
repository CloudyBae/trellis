import os
from pathlib import Path
from typing import NamedTuple

from ..util.javascript import parse_json


class DirEntry(NamedTuple):
    name: str
    is_file: bool
    is_directory: bool


def read_json(file: str | Path) -> object:
    try:
        with open(file, "rb") as handle:
            return parse_json(handle.read().decode("utf-8", "replace"))
    except (OSError, ValueError):
        return None


def list_dir(directory: str | Path) -> list[DirEntry]:
    try:
        with os.scandir(directory) as entries:
            found = [
                DirEntry(
                    entry.name,
                    entry.is_file(follow_symlinks=False),
                    entry.is_dir(follow_symlinks=False),
                )
                for entry in entries
            ]
    except OSError:
        return []
    return sorted(found)


def mtime(file: str | Path) -> float:
    try:
        return os.stat(file).st_mtime_ns / 1_000_000
    except OSError:
        return 0
