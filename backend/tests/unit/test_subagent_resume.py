import pytest

from trellis.hosts.claude.build import AgentBuilder
from trellis.hosts.claude.records import BuildContext, Event, Node, SubagentFile
from trellis.sessions.models import Agent

START_MS = 1_000_000.0


def build_subagent(live: bool, later_kind: str | None):
    file = SubagentFile("agent.jsonl", "a1", "agent.meta.json")
    file.events = [
        Event(ts=START_MS + 1000, kind="say", text="working"),
        Event(ts=START_MS + 2000, kind="handback", text="done"),
    ]
    if later_kind:
        file.events.append(Event(ts=START_MS + 9000, kind=later_kind, text="again"))
    file.last_ts = file.events[-1].ts
    context = BuildContext(
        t0=START_MS,
        cwd="",
        live=live,
        last_ts=file.last_ts,
        results={},
        spawned_ids=set(),
        id_of_file={},
    )
    builder = AgentBuilder(context)
    collected = builder.collect_turns(file)
    agent = Agent(
        id=2,
        src="Claude Code",
        start=0,
        name="n",
        task="t",
        turns=[],
        context=[],
        completeness="complete",
    )
    builder.end_subagent(
        agent, Node(file=file, key="a1", start=START_MS, id=2), collected
    )
    return agent


@pytest.mark.parametrize("later_kind", ["user", "say", "use"])
def test_a_retriggered_subagent_is_running_again_while_the_session_is_live(later_kind):
    agent = build_subagent(live=True, later_kind=later_kind)
    assert agent.end is None
    assert agent.final is None
    assert agent.returned is None


def test_a_handed_back_subagent_stays_complete_without_later_activity():
    agent = build_subagent(live=True, later_kind=None)
    assert agent.final == "complete"
    assert agent.end == 2


def test_a_retriggered_subagent_in_a_finished_session_stays_complete():
    agent = build_subagent(live=False, later_kind="say")
    assert agent.final == "complete"
