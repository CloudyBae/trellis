import copy
import json

import pytest
from pydantic import ValidationError

from tests.builders import make_agent, make_session
from tests.scenario_data import load_case_table, shape_names
from trellis.hosts.completeness import completeness
from trellis.sessions.models import (
    Agent,
    MsgTurn,
    Phase,
    Returned,
    Run,
    Session,
    ToolTurn,
    UserTurn,
)
from trellis.sessions.serialize import dump_session
from trellis.util.json_text import js_json

STATES = ("running", "waiting", "blocked", "failed", "complete")


def agent_dict(**extra: object) -> dict:
    return {
        "id": 1,
        "name": "Main agent",
        "src": "Codex",
        "start": 0,
        "task": "Do it",
        "context": [],
        "turns": [],
        "completeness": "complete",
        **extra,
    }


def session_dict(agents: list[dict]) -> dict:
    return {
        "id": "cc:a",
        "rawId": "a",
        "live": False,
        "t0": 1,
        "endAt": 2,
        "run": {"name": "n", "repo": "r", "source": "s", "file": "f"},
        "agents": agents,
    }


def dumped_agent(agent: Agent) -> dict:
    session = make_session("cc:a", "a")
    session.agents = [agent]
    return json.loads(dump_session(session))["agents"][0]


@pytest.mark.parametrize("name", shape_names())
def test_shape_round_trips_through_the_model(name: str):
    scenario = load_case_table(f"shapes/{name}")
    with_completeness = copy.deepcopy(scenario)
    for agent in with_completeness["agents"]:
        agent["completeness"] = "complete"
    session = Session.model_validate(with_completeness)
    result = json.loads(dump_session(session))
    for agent in result["agents"]:
        del agent["completeness"]
    assert result == scenario


def test_the_model_accepts_every_turn_kind_and_state():
    turns = [
        ToolTurn(
            at=1,
            kind="tool",
            name="Bash",
            target="ls",
            out="ok",
            ms=12,
            fail=True,
            pending=True,
        ),
        MsgTurn(at=2, kind="msg", text="hello"),
        UserTurn(at=3, kind="user", text="hi"),
    ]
    phases = [
        Phase(at=index, state=state, note=state) for index, state in enumerate(STATES)
    ]
    agent = Agent(
        id=1,
        name="Main agent",
        src="Claude Code",
        start=0,
        task="Do it",
        context=["src/a.ts"],
        turns=turns,
        completeness="partial",
        file="~/a.jsonl",
        parent=None,
        brief="brief",
        agent_type="Explore",
        end=9,
        final="failed",
        returned=Returned(summary="s", items=["i"], text="t", note="n"),
        phases=phases,
        trimmed=4,
        approx_times=True,
    )
    session = Session(
        id="cc:a",
        raw_id="a",
        live=True,
        t0=1.5,
        end_at=3,
        via="traces",
        hooks=True,
        run=Run(name="n", repo="r", source="s", file="f"),
        agents=[agent],
    )
    rebuilt = Session.model_validate(json.loads(dump_session(session)))
    assert dump_session(rebuilt) == dump_session(session)
    kinds = [
        turn["kind"] for turn in json.loads(dump_session(session))["agents"][0]["turns"]
    ]
    assert kinds == ["tool", "msg", "user"]
    assert [phase.state for phase in phases] == list(STATES)
    assert Agent.model_validate(agent_dict(final="complete")).final == "complete"


def test_the_model_rejects_unknown_fields_at_every_level():
    with pytest.raises(ValidationError):
        Agent.model_validate(agent_dict(bogus=1))
    with pytest.raises(ValidationError):
        Session.model_validate({**session_dict([agent_dict()]), "bogus": 1})
    with pytest.raises(ValidationError):
        Agent.model_validate(
            agent_dict(turns=[{"at": 1, "kind": "msg", "text": "t", "x": 1}])
        )
    with pytest.raises(ValidationError):
        Run.model_validate(
            {"name": "n", "repo": "r", "source": "s", "file": "f", "x": 1}
        )


def test_the_model_requires_completeness_and_rejects_unknown_values():
    without = agent_dict()
    del without["completeness"]
    with pytest.raises(ValidationError):
        Agent.model_validate(without)
    with pytest.raises(ValidationError):
        Agent.model_validate(agent_dict(completeness="mostly"))


def test_the_model_rejects_unknown_kinds_states_and_finals():
    with pytest.raises(ValidationError):
        Agent.model_validate(agent_dict(turns=[{"at": 1, "kind": "note", "text": "t"}]))
    with pytest.raises(ValidationError):
        Agent.model_validate(
            agent_dict(phases=[{"at": 1, "state": "asleep", "note": "n"}])
        )
    with pytest.raises(ValidationError):
        Agent.model_validate(agent_dict(final="running"))


def test_the_wire_names_are_camel_case_and_python_names_also_populate():
    by_alias = Session.model_validate(
        session_dict([agent_dict(agentType="Explore", approxTimes=True)])
    )
    data = session_dict([agent_dict(agent_type="Explore", approx_times=True)])
    del data["rawId"]
    data["raw_id"] = "a"
    by_name = Session.model_validate(data)
    assert by_name.raw_id == "a"
    assert by_name.agents[0].approx_times is True
    dumped = json.loads(dump_session(by_alias))
    assert dumped["rawId"] == "a"
    assert dumped["agents"][0]["agentType"] == "Explore"
    assert dumped["agents"][0]["approxTimes"] is True


def test_a_field_set_to_none_is_null_and_a_never_set_field_is_absent():
    absent = dumped_agent(make_agent())
    assert "brief" not in absent
    assert "parent" not in absent
    null = dumped_agent(Agent.model_validate(agent_dict(brief=None, parent=None)))
    assert null["brief"] is None
    assert null["parent"] is None


def test_integral_floats_are_emitted_as_ints():
    turn = ToolTurn(at=1, kind="tool", name="n", target="t", out="o", ms=70.0)
    session = Session.model_validate(session_dict([agent_dict()]))
    session.t0 = 1790589600000.0
    session.agents[0].turns = [turn]
    text = dump_session(session)
    assert '"t0":1790589600000,' in text
    assert '"ms":70}' in text
    half = ToolTurn(at=1, kind="tool", name="n", target="t", out="o", ms=1.5)
    session.agents[0].turns = [half]
    assert '"ms":1.5}' in dump_session(session)


def test_the_dump_is_compact_and_keeps_non_ascii_text():
    agent = Agent.model_validate(
        agent_dict(task="caf\u00e9 \u4e2d\u6587 \U0001f600 \u2028")
    )
    text = json.dumps(dumped_agent(agent), ensure_ascii=False)
    assert "caf\u00e9 \u4e2d\u6587 \U0001f600 \u2028" in text
    session = Session.model_validate(
        session_dict([agent_dict(task='caf\u00e9 "q" \n')])
    )
    dumped = dump_session(session)
    assert ", " not in dumped and ": " not in dumped
    assert "caf\u00e9" in dumped
    assert '\\"q\\" \\n' in dumped


def test_a_lone_surrogate_is_escaped_and_never_raises():
    lone = chr(0xD83D)
    session = Session.model_validate(session_dict([agent_dict(task="cut" + lone)]))
    text = dump_session(session)
    assert "cut\\ud83d" in text
    text.encode("utf-8")
    assert js_json({"a": lone + "\u2026"}) == '{"a":"\\ud83d\u2026"}'
    assert js_json("\x1f\x7f") == '"\\u001f\x7f"'


def test_js_json_matches_javascript_number_rules():
    assert (
        js_json([1.0, 2.5, float("nan"), float("inf"), -0.0, True, None])
        == "[1,2.5,null,null,0,true,null]"
    )


def test_completeness_follows_the_rule_order():
    def rate(**overrides: object) -> str:
        arguments: dict = {
            "source": "codex",
            "is_subagent": False,
            "meta_only": False,
            "has_real_task": True,
            "has_own_turns": True,
            "has_conversation_turns": True,
            "trimmed": False,
        }
        arguments.update(overrides)
        return completeness(**arguments)

    assert rate() == "complete"
    assert rate(source="claude", is_subagent=True, meta_only=True) == "partial"
    assert (
        rate(
            source="claude",
            is_subagent=True,
            meta_only=True,
            has_real_task=False,
            has_conversation_turns=False,
        )
        == "partial"
    )
    assert rate(source="copilot", is_subagent=True, has_own_turns=False) == "partial"
    assert rate(source="copilot", is_subagent=False, has_own_turns=False) == "complete"
    assert rate(source="codex", is_subagent=True, has_own_turns=False) == "complete"
    assert rate(has_real_task=False, has_conversation_turns=False) == "activity_only"
    assert (
        rate(
            source="copilot",
            is_subagent=True,
            has_real_task=False,
            has_own_turns=False,
            has_conversation_turns=False,
        )
        == "activity_only"
    )
    assert rate(has_real_task=False) == "partial"
    assert rate(trimmed=True) == "partial"
    assert (
        rate(has_real_task=False, has_conversation_turns=False, trimmed=True)
        == "activity_only"
    )
