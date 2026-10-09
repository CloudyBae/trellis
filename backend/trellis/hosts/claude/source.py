import os
from collections.abc import Sequence

from ...runtime.sources import Clock, Log, SessionSink
from ...util.javascript import JS_WHITESPACE
from ..constants import LIVE_PENDING_MS
from ..files import list_dir, mtime, read_json
from ..sessions import is_refreshable
from ..source import HostSource
from .build import SessionBuilder
from .ingest import ClaudeIngester
from .records import (
    Blocked,
    ClaudeHookPayload,
    SessionState,
    SubagentFile,
    TranscriptFile,
)

DEFAULT_BLOCKED_MESSAGE = "Waiting for your approval."
CLEARS_BLOCKED = (
    "PostToolUse",
    "PostToolUseFailure",
    "UserPromptSubmit",
    "Stop",
    "SubagentStop",
)


def needs_approval(text: str) -> bool:
    folded = "".join(char.lower() if char.isascii() else char for char in text)
    return "permission" in folded or "approv" in folded


def tool_named_in(message: str) -> str | None:
    marker = "to use "
    start = 0
    while (found := message.find(marker, start)) != -1:
        token_start = found + len(marker)
        token_end = token_start
        while token_end < len(message) and message[token_end] not in JS_WHITESPACE:
            token_end += 1
        if token_end > token_start:
            return message[token_start:token_end]
        start = found + 1
    return None


class ClaudeSource(HostSource):
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
        self.sessions: dict[str, SessionState] = {}

    def ensure(self, sid: str, main_path: str) -> SessionState:
        state = self.sessions.get(sid)
        if state is None:
            state = SessionState(
                sid=sid,
                main_path=main_path,
                dir=main_path.removesuffix(".jsonl"),
                main=TranscriptFile(main_path),
            )
            self.sessions[sid] = state
        return state

    def scan(self) -> None:
        cutoff = self.clock() - self.since_ms
        for root in self.roots:
            for project in list_dir(root):
                if not project.is_directory:
                    continue
                project_dir = os.path.join(root, project.name)
                for entry in list_dir(project_dir):
                    if not entry.is_file or not entry.name.endswith(".jsonl"):
                        continue
                    file = os.path.join(project_dir, entry.name)
                    sid = entry.name[:-6]
                    if sid not in self.sessions and mtime(file) < cutoff:
                        continue
                    self.scan_subs(self.ensure(sid, file))

    def scan_subs(self, state: SessionState) -> None:
        subagents_dir = os.path.join(state.dir, "subagents")
        for entry in list_dir(subagents_dir):
            if not entry.is_file or not entry.name.endswith(".jsonl"):
                continue
            agent_id = entry.name.removeprefix("agent-").removesuffix(".jsonl")
            if agent_id not in state.subs:
                state.subs[agent_id] = SubagentFile(
                    os.path.join(subagents_dir, entry.name),
                    agent_id,
                    os.path.join(
                        subagents_dir, entry.name.removesuffix(".jsonl") + ".meta.json"
                    ),
                )
                state.dirty = True

    def read(self, file: TranscriptFile, is_main: bool) -> bool:
        return file.tail.read(ClaudeIngester(file, is_main).ingest, file.reset)

    def poll(self) -> None:
        for state in list(self.sessions.values()):
            self.poll_session(state)

    def poll_session(self, state: SessionState) -> None:
        if self.read(state.main, True):
            state.dirty = True
        for sub in state.subs.values():
            if self.read(sub, False):
                state.dirty = True
            modified = mtime(sub.meta_file)
            if modified != sub.meta_mtime:
                sub.meta_mtime = modified
                sub.meta = read_json(sub.meta_file)
                state.dirty = True
        if state.dirty:
            state.dirty = False
            self.publish(state)

    def publish(self, state: SessionState) -> None:
        if not state.main.first_ts:
            return
        try:
            self.store.put(SessionBuilder(state, self.clock()).build())
        except Exception as error:
            if self.log is not None:
                self.log(f"claude: could not build {state.sid}: {type(error).__name__}")

    def hook(self, payload: ClaudeHookPayload) -> None:
        sid = payload.session_id
        if not sid:
            return
        state = self.sessions.get(sid)
        transcript_path = payload.transcript_path
        if state is None and transcript_path:
            state = self.ensure(sid, transcript_path)
            self.scan_subs(state)
        if state is None:
            return
        event = payload.hook_event_name
        now = self.clock()
        state.hook.last_at = now
        message = payload.message or ""
        tool_name = payload.tool_name
        agent_id = payload.agent_id or None
        state.hook.seen = True
        notification_type = payload.notification_type or ""
        if event == "Notification" and needs_approval(f"{notification_type} {message}"):
            state.hook.blocked = Blocked(
                at=now,
                message=message or DEFAULT_BLOCKED_MESSAGE,
                tool=tool_named_in(message),
                agent_id=agent_id,
            )
        elif event == "PermissionRequest":
            state.hook.blocked = Blocked(
                at=now,
                message=(
                    f"Waiting for your approval to run {tool_name}."
                    if tool_name
                    else DEFAULT_BLOCKED_MESSAGE
                ),
                tool=tool_name or None,
                agent_id=agent_id,
            )
        elif event in CLEARS_BLOCKED:
            state.hook.blocked = None
        if event == "Stop":
            state.hook.stopped_at = now
        if event == "UserPromptSubmit":
            state.hook.stopped_at = 0.0
            state.ended = False
        if event == "SessionStart":
            state.ended = False
        if event == "SessionEnd":
            state.ended = True
        if event in ("SubagentStart", "SubagentStop"):
            self.scan_subs(state)
        state.dirty = True
        self.poll_session(state)

    def last_activity(self, state: SessionState) -> float:
        return max(
            state.hook.last_at,
            mtime(state.main_path),
            *(mtime(sub.file) for sub in state.subs.values()),
        )

    def evict(self) -> None:
        cutoff = self.clock() - self.since_ms
        for sid, state in list(self.sessions.items()):
            if self.last_activity(state) < cutoff:
                del self.sessions[sid]
                self.store.remove("cc:" + sid)

    def refresh(self) -> None:
        self.evict()
        for state in list(self.sessions.values()):
            if state.main.first_ts and is_refreshable(
                self.clock(), state.main.last_ts, LIVE_PENDING_MS
            ):
                self.publish(state)
