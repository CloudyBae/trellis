from abc import ABC, abstractmethod

from ..sessions.models import Agent, Run, Session, ToolTurn
from ..util.timestamps import secs


class BaseSessionBuilder(ABC):
    t0: float
    last_ts: float
    live: bool

    def build(self) -> Session:
        agents = self.build_agents()
        for agent in agents:
            if self.gave_up_on_failed_call(agent):
                agent.final = "failed"
        if len(agents) > 1:
            agents[0].name = "Orchestrator"
        return self.to_session(agents)

    def to_session(self, agents: list[Agent]) -> Session:
        return Session(
            id=self.session_id(),
            raw_id=self.raw_id(),
            live=self.live,
            t0=self.t0,
            end_at=secs(self.last_ts, self.t0),
            run=self.run(agents),
            agents=agents,
        )

    def gave_up_on_failed_call(self, agent: Agent) -> bool:
        if agent.parent is None or agent.final != "complete":
            return False
        last_call = next(
            (turn for turn in reversed(agent.turns) if isinstance(turn, ToolTurn)),
            None,
        )
        return last_call is not None and last_call.fail is True

    def raw_id(self) -> str | None:
        return None

    @abstractmethod
    def build_agents(self) -> list[Agent]: ...

    @abstractmethod
    def session_id(self) -> str: ...

    @abstractmethod
    def run(self, agents: list[Agent]) -> Run: ...
