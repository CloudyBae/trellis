import json
import os
from pathlib import Path

import pytest

from trellis.hosts import jsonl
from trellis.hosts.files import DirEntry, list_dir, mtime, read_json
from trellis.hosts.jsonl import JsonlTail


def collect(tail: JsonlTail) -> tuple[list[object], bool]:
    records: list[object] = []
    changed = tail.read(records.append)
    return records, changed


def test_reads_complete_lines_and_skips_blank_and_unparseable_lines(tmp_path: Path):
    file = tmp_path / "a.jsonl"
    file.write_text('{"n":1}\n\n   \nnot json\n{"n":2}\nNaN\n[3]\n')
    records, changed = collect(JsonlTail(file))
    assert records == [{"n": 1}, {"n": 2}, [3]]
    assert changed is True


def test_holds_back_a_partial_last_line_until_its_newline_arrives(tmp_path: Path):
    file = tmp_path / "a.jsonl"
    line = json.dumps({"text": "One more thing."})
    file.write_text('{"n":1}\n' + line[:10])
    tail = JsonlTail(file)
    records, _ = collect(tail)
    assert records == [{"n": 1}]
    with file.open("a") as handle:
        handle.write(line[10:])
    records, changed = collect(tail)
    assert records == []
    assert changed is True
    with file.open("a") as handle:
        handle.write("\n")
    records, _ = collect(tail)
    assert records == [{"text": "One more thing."}]


def test_a_line_that_spans_chunks_is_read_whole(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(jsonl, "CHUNK_BYTES", 7)
    file = tmp_path / "a.jsonl"
    file.write_text('{"text":"caf\u00e9 \u4e2d\u6587"}\n{"n":2}\n', encoding="utf-8")
    records, _ = collect(JsonlTail(file))
    assert records == [{"text": "caf\u00e9 \u4e2d\u6587"}, {"n": 2}]


def test_a_byte_order_mark_and_javascript_whitespace_are_trimmed(tmp_path: Path):
    file = tmp_path / "a.jsonl"
    file.write_bytes('\ufeff{"n":1}\u00a0\n'.encode())
    records, _ = collect(JsonlTail(file))
    assert records == [{"n": 1}]


def test_skips_work_when_size_and_mtime_are_unchanged(tmp_path: Path):
    file = tmp_path / "a.jsonl"
    file.write_text('{"n":1}\n')
    tail = JsonlTail(file)
    collect(tail)
    records, changed = collect(tail)
    assert records == []
    assert changed is False


def test_restarts_from_zero_and_calls_on_reset_when_the_file_shrinks(tmp_path: Path):
    file = tmp_path / "a.jsonl"
    file.write_text('{"n":1}\n{"n":2}\n{"n":3}\n')
    tail = JsonlTail(file)
    collect(tail)
    file.write_text('{"n":9}\n')
    events: list[object] = []
    changed = tail.read(events.append, lambda: events.append("reset"))
    assert events == ["reset", {"n": 9}]
    assert changed is True


def test_a_missing_file_reports_no_change(tmp_path: Path):
    records, changed = collect(JsonlTail(tmp_path / "missing.jsonl"))
    assert records == []
    assert changed is False


def test_read_json_returns_none_on_any_failure(tmp_path: Path):
    good = tmp_path / "good.json"
    good.write_text('{"a": [1, 2]}')
    bad = tmp_path / "bad.json"
    bad.write_text("{oops")
    assert read_json(good) == {"a": [1, 2]}
    assert read_json(bad) is None
    assert read_json(tmp_path / "missing.json") is None


def test_list_dir_reports_entry_kinds_and_tolerates_a_missing_directory(
    tmp_path: Path,
):
    (tmp_path / "b.txt").write_text("x")
    (tmp_path / "a").mkdir()
    os.symlink(tmp_path / "a", tmp_path / "link")
    assert list_dir(tmp_path) == [
        DirEntry("a", False, True),
        DirEntry("b.txt", True, False),
        DirEntry("link", False, False),
    ]
    assert list_dir(tmp_path / "missing") == []


def test_mtime_is_in_milliseconds_and_zero_for_a_missing_file(tmp_path: Path):
    file = tmp_path / "a"
    file.write_text("x")
    os.utime(file, ns=(2_000_000_000, 1_500_000_000_000_000))
    assert mtime(file) == 1_500_000_000.0
    assert mtime(tmp_path / "missing") == 0
