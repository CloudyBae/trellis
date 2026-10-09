from trellis.hosts.session_builder import BaseSessionBuilder
from trellis.sessions.models import Agent, Run


class FixedAgentsBuilder(BaseSessionBuilder):
    def __init__(self, agent_count: int) -> None:
        self.agent_count = agent_count
        self.t0 = 1000
        self.last_ts = 5000
        self.live = False

    def build_agents(self) -> list[Agent]:
        return [
            Agent(
                id=index + 1,
                name="Main agent",
                src="Codex",
                start=0,
                task="task",
                context=[],
                turns=[],
                completeness="complete",
            )
            for index in range(self.agent_count)
        ]

    def session_id(self) -> str:
        return "fixed:1"

    def run(self, agents: list[Agent]) -> Run:
        return Run(name="run", repo="", source="Codex", file="")


def test_single_agent_keeps_its_name():
    session = FixedAgentsBuilder(1).build()
    assert session.agents[0].name == "Main agent"


def test_first_agent_is_the_orchestrator_when_there_are_several():
    session = FixedAgentsBuilder(2).build()
    assert [agent.name for agent in session.agents] == ["Orchestrator", "Main agent"]
    assert session.end_at == 4
    assert "raw_id" in session.model_dump(exclude_unset=True)
