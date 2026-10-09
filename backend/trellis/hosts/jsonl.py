import os
from collections.abc import Callable
from pathlib import Path

from ..util.javascript import js_trim, parse_json

CHUNK_BYTES = 8 * 1024 * 1024


class JsonlTail:
    def __init__(self, file: str | Path) -> None:
        self.file = file
        self.offset = 0
        self.rest = b""
        self.size = -1
        self.mtime_ns = 0

    def read(
        self,
        on_record: Callable[[object], None],
        on_reset: Callable[[], None] | None = None,
    ) -> bool:
        try:
            stat = os.stat(self.file)
        except OSError:
            return False
        if stat.st_size == self.size and stat.st_mtime_ns == self.mtime_ns:
            return False
        reset = False
        if stat.st_size < self.offset:
            self.offset = 0
            self.rest = b""
            reset = True
            if on_reset is not None:
                on_reset()
        self.size = stat.st_size
        self.mtime_ns = stat.st_mtime_ns
        if stat.st_size == self.offset:
            return reset
        with open(self.file, "rb") as handle:
            while self.offset < stat.st_size:
                handle.seek(self.offset)
                chunk = handle.read(min(CHUNK_BYTES, stat.st_size - self.offset))
                if not chunk:
                    break
                self.offset += len(chunk)
                data = self.rest + chunk
                start = 0
                while (newline := data.find(b"\n", start)) != -1:
                    line = js_trim(data[start:newline].decode("utf-8", "replace"))
                    start = newline + 1
                    if not line:
                        continue
                    try:
                        record = parse_json(line)
                    except ValueError:
                        continue
                    on_record(record)
                self.rest = data[start:]
        return True
