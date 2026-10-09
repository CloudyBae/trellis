import os
from collections.abc import Sequence
from dataclasses import dataclass

from ...runtime.sources import Clock, Log, SessionSink
from ...sessions.constants import LIVE_MS
from ..files import list_dir, mtime, read_json
from ..sessions import is_refreshable
from ..source import HostSource
from .build import SessionBuilder
from .replay import LogReplayer
from .uri import workspace_name


@dataclass
class ChatFile:
    file: str
    storage: str | None


@dataclass
class CachedChat:
    session_id: str
    data: dict
    repo: str
    last_ts: float


class CopilotSource(HostSource):
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
        self.seen: dict[str, float] = {}
        self.meta: dict[str, CachedChat] = {}
        self.chat_files: list[ChatFile] = []

    def scan(self) -> None:
        self.chat_files = []
        for root in self.roots:
            ws_dir = os.path.join(root, "workspaceStorage")
            for ws in list_dir(ws_dir):
                if not ws.is_directory:
                    continue
                chat_dir = os.path.join(ws_dir, ws.name, "chatSessions")
                for entry in list_dir(chat_dir):
                    if entry.is_file and entry.name.endswith((".json", ".jsonl")):
                        self.chat_files.append(
                            ChatFile(
                                file=os.path.join(chat_dir, entry.name),
                                storage=os.path.join(ws_dir, ws.name),
                            )
                        )
            empty_dir = os.path.join(root, "globalStorage", "emptyWindowChatSessions")
            for entry in list_dir(empty_dir):
                if entry.is_file and entry.name.endswith((".json", ".jsonl")):
                    self.chat_files.append(
                        ChatFile(file=os.path.join(empty_dir, entry.name), storage=None)
                    )

    def poll(self) -> None:
        cutoff = self.clock() - self.since_ms
        for chat_file in self.chat_files:
            file = chat_file.file
            storage = chat_file.storage
            file_mtime = mtime(file)
            if file_mtime < cutoff or self.seen.get(file) == file_mtime:
                continue
            self.seen[file] = file_mtime
            try:
                if file.endswith(".jsonl"):
                    data = LogReplayer().replay(file)
                else:
                    data = read_json(file)
                if not isinstance(data, dict):
                    continue
                requests = data.get("requests")
                if not isinstance(requests, list) or not requests:
                    continue
                repo = workspace_name(storage) if storage else ""
                session = SessionBuilder(data, file, repo, self.clock()).build()
                self.meta[file] = CachedChat(
                    session_id=session.id,
                    data=data,
                    repo=repo,
                    last_ts=session.t0 + session.end_at * 1000,
                )
                self.store.put(session)
            except Exception as error:
                if self.log is not None:
                    self.log(f"copilot: could not read {file}: {type(error).__name__}")

    def evict(self) -> None:
        cutoff = self.clock() - self.since_ms
        for file, meta_info in list(self.meta.items()):
            if mtime(file) < cutoff:
                del self.meta[file]
                self.seen.pop(file, None)
                self.store.remove(meta_info.session_id)

    def refresh(self) -> None:
        self.evict()
        for file, meta_info in list(self.meta.items()):
            if is_refreshable(self.clock(), meta_info.last_ts, LIVE_MS):
                try:
                    self.store.put(
                        SessionBuilder(
                            meta_info.data, file, meta_info.repo, self.clock()
                        ).build()
                    )
                except Exception as error:
                    if self.log is not None:
                        self.log(
                            f"copilot: could not build {file}: {type(error).__name__}"
                        )
