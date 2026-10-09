import os
from collections.abc import Sequence

from ...runtime.sources import Clock, Log, SessionSink
from ...util.javascript import LINE_TERMINATORS
from ..constants import LIVE_PENDING_MS
from ..files import list_dir, mtime
from ..sessions import is_refreshable
from ..source import HostSource
from .build import SessionBuilder
from .ingest import CodexIngester
from .records import CodexFile

ROLLOUT_PREFIX = "rollout-"
ROLLOUT_SUFFIX = ".jsonl"


def is_rollout_name(name: str) -> bool:
    return (
        len(name) >= len(ROLLOUT_PREFIX) + len(ROLLOUT_SUFFIX)
        and name.startswith(ROLLOUT_PREFIX)
        and name.endswith(ROLLOUT_SUFFIX)
        and not any(
            char in LINE_TERMINATORS
            for char in name[len(ROLLOUT_PREFIX) : -len(ROLLOUT_SUFFIX)]
        )
    )


class CodexSource(HostSource):
    def __init__(
        self,
        *,
        roots: Sequence[str],
        since_ms: float,
        store: SessionSink,
        clock: Clock,
        log: Log | None = None,
    ) -> None:
        super().__init__(
            roots=roots, since_ms=since_ms, store=store, clock=clock, log=log
        )
        self.files: dict[str, CodexFile] = {}

    def walk(self, dir_path: str, depth: int, cutoff: float) -> None:
        for entry in list_dir(dir_path):
            path = os.path.normpath(os.path.join(dir_path, entry.name))
            if entry.is_directory and depth < 4:
                self.walk(path, depth + 1, cutoff)
            elif (
                entry.is_file
                and is_rollout_name(entry.name)
                and path not in self.files
                and mtime(path) >= cutoff
            ):
                self.files[path] = CodexFile(path)

    def scan(self) -> None:
        cutoff = self.clock() - self.since_ms
        for root in self.roots:
            self.walk(root, 0, cutoff)

    def poll(self) -> None:
        changed: dict[CodexFile, None] = {}
        for file_record in self.files.values():
            if file_record.tail.read(
                CodexIngester(file_record).ingest,
                file_record.reset,
            ):
                changed[file_record] = None
        if not changed:
            return
        by_sid = {
            file_record.sid: file_record
            for file_record in self.files.values()
            if file_record.sid
        }

        roots = dict.fromkeys(
            self.root_of(file_record, by_sid)
            for file_record in changed
            if file_record.sid
        )
        for root_file in roots:
            self.publish(root_file)

    def root_of(
        self, file_record: CodexFile, by_sid: dict[str, CodexFile]
    ) -> CodexFile:
        root = file_record
        hops = 0
        while hops < 8:
            parent = root.parent
            if not (isinstance(parent, str) and parent in by_sid):
                break
            root = by_sid[parent]
            hops += 1
        return root

    def publish(self, root_file: CodexFile) -> None:
        try:
            all_files = list(self.files.values())

            def kids_of(file_record: CodexFile) -> list[CodexFile]:
                return [
                    kid
                    for kid in all_files
                    if isinstance(kid.parent, str)
                    and kid.parent
                    and kid.parent == file_record.sid
                ]

            self.store.put(SessionBuilder(root_file, kids_of, self.clock()).build())
        except Exception as error:
            if self.log:
                self.log(
                    f"codex: could not build {root_file.file}: {type(error).__name__}"
                )

    def evict(self) -> None:
        cutoff = self.clock() - self.since_ms
        by_sid = {
            file_record.sid: file_record
            for file_record in self.files.values()
            if file_record.sid
        }
        groups: dict[CodexFile, list[CodexFile]] = {}
        for file_record in self.files.values():
            root_file = self.root_of(file_record, by_sid)
            groups.setdefault(root_file, []).append(file_record)
        for root_file, group in groups.items():
            if max(mtime(member.file) for member in group) < cutoff:
                for member in group:
                    del self.files[member.file]
                self.store.remove("codex:" + (root_file.sid or root_file.file))

    def refresh(self) -> None:
        self.evict()
        for file_record in list(self.files.values()):
            if (
                file_record.sid
                and not file_record.parent
                and is_refreshable(self.clock(), file_record.last_ts, LIVE_PENDING_MS)
            ):
                self.publish(file_record)
