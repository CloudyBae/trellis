from trellis.hosts.session_builder import BaseSessionBuilder
from trellis.sessions.models import Agent, Run, ToolTurn


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


def tool_turn(at: int, fail: bool | None) -> ToolTurn:
    return ToolTurn(at=at, kind="tool", name="Read", target="a.txt", out="", fail=fail)


class ScriptedAgentsBuilder(FixedAgentsBuilder):
    def __init__(self, subagent_turns: list[ToolTurn], subagent_final: str = "complete") -> None:
        super().__init__(2)
        self.subagent_turns = subagent_turns
        self.subagent_final = subagent_final

    def build_agents(self) -> list[Agent]:
        root, subagent = super().build_agents()
        subagent.parent = 1
        subagent.turns = list(self.subagent_turns)
        subagent.final = self.subagent_final
        root.final = "complete"
        return [root, subagent]


def test_subagent_that_returned_right_after_a_failed_call_is_failed():
    session = ScriptedAgentsBuilder([tool_turn(1, False), tool_turn(2, True)]).build()
    assert session.agents[1].final == "failed"


def test_subagent_that_recovered_from_a_failed_call_stays_complete():
    session = ScriptedAgentsBuilder([tool_turn(1, True), tool_turn(2, None)]).build()
    assert session.agents[1].final == "complete"


def test_root_agent_ending_on_a_failed_call_stays_complete():
    builder = ScriptedAgentsBuilder([])
    root, _ = builder.build_agents()
    root.turns = [tool_turn(1, True)]
    assert not builder.gave_up_on_failed_call(root)
