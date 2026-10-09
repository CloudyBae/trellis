from pydantic import BaseModel

from ...sessions.models import Session


class HelloEvent(BaseModel):
    sessions: list[Session]


class SessionEvent(Session):
    pass


class RemoveEvent(BaseModel):
    id: str
