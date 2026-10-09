from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

State = Literal["running", "waiting", "blocked", "failed", "complete"]
Final = Literal["complete", "failed"]
Completeness = Literal["complete", "partial", "activity_only"]
Via = Literal["traces", "logs"]


class _Model(BaseModel):
    model_config = ConfigDict(
        extra="forbid", alias_generator=to_camel, populate_by_name=True
    )


class Run(_Model):
    name: str
    repo: str
    source: str
    file: str


class Returned(_Model):
    summary: str
    items: list[str]
    text: str | None = None
    note: str | None = None


class Usage(_Model):
    input: int
    output: int
    cache_read: int
    cache_write: int


class Phase(_Model):
    at: int
    state: State
    note: str


class ToolTurn(_Model):
    at: int
    kind: Literal["tool"]
    name: str
    target: str
    out: str
    ms: int | float | None = None
    fail: bool | None = None
    pending: bool | None = None


class MsgTurn(_Model):
    at: int
    kind: Literal["msg"]
    text: str


class UserTurn(_Model):
    at: int
    kind: Literal["user"]
    text: str


Turn = Annotated[ToolTurn | MsgTurn | UserTurn, Field(discriminator="kind")]


class Agent(_Model):
    id: int
    name: str
    src: str
    start: int
    task: str
    context: list[str]
    turns: list[Turn]
    completeness: Completeness
    file: str | None = None
    parent: int | None = None
    brief: str | None = None
    agent_type: str | None = None
    model: str | None = None
    usage: Usage | None = None
    end: int | None = None
    final: Final | None = None
    returned: Returned | None = None
    phases: list[Phase] | None = None
    trimmed: int | None = None
    approx_times: bool | None = None


class Session(_Model):
    id: str
    raw_id: str | None = None
    live: bool
    t0: int | float
    end_at: int
    via: Via | None = None
    hooks: bool | None = None
    run: Run
    agents: list[Agent]
