from pydantic import BaseModel


class Accepted(BaseModel):
    pass


class Health(BaseModel):
    ok: bool
    sources: list[str]
    sessions: int
