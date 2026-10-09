from collections.abc import Callable

from ..sessions.models import Session
from ..sessions.serialize import dump_session

Callback = Callable[[str], None]


class Store:
    def __init__(self) -> None:
        self.sessions: dict[str, Session] = {}
        self.json: dict[str, str] = {}
        self.change_callbacks: list[Callback] = []
        self.remove_callbacks: list[Callback] = []

    def on_change(self, callback: Callback) -> None:
        self.change_callbacks.append(callback)

    def on_remove(self, callback: Callback) -> None:
        self.remove_callbacks.append(callback)

    def put(self, session: Session) -> None:
        if not session.agents:
            return
        dumped = dump_session(session)
        if self.json.get(session.id) == dumped:
            return
        visible_before = {listed.id for listed in self.list()}
        self.sessions[session.id] = session
        self.json[session.id] = dumped
        if self.hidden(session):
            return
        for callback in list(self.change_callbacks):
            callback(session.id)
        removed_ids_dict: dict[str, None] = {}
        if session.via is None:
            for other in list(self.sessions.values()):
                if other.via is not None and other.raw_id == session.raw_id:
                    removed_ids_dict[other.id] = None
        visible_after = {listed.id for listed in self.list()}
        for session_id in visible_before:
            if session_id not in visible_after and session_id != session.id:
                removed_ids_dict[session_id] = None
        for session_id in removed_ids_dict:
            for callback in list(self.remove_callbacks):
                callback(session_id)

    def remove(self, session_id: str) -> None:
        if session_id not in self.sessions:
            return
        visible_before = {listed.id for listed in self.list()}
        del self.sessions[session_id]
        self.json.pop(session_id, None)
        for callback in list(self.remove_callbacks):
            callback(session_id)
        for listed in self.list():
            if listed.id not in visible_before:
                for callback in list(self.change_callbacks):
                    callback(listed.id)

    def hidden(self, session: Session) -> bool:
        if session.via is None:
            return False
        for other in self.sessions.values():
            if other.via is None and other.raw_id and other.raw_id == session.raw_id:
                return True
        return session.via == "logs" and f"otel:{session.raw_id or ''}" in self.sessions

    def get(self, session_id: str) -> Session | None:
        return self.sessions.get(session_id)

    def json_of(self, session_id: str) -> str | None:
        return self.json.get(session_id)

    def list(self) -> list[Session]:
        visible = [
            session for session in self.sessions.values() if not self.hidden(session)
        ]
        return sorted(visible, key=lambda session: session.t0, reverse=True)
