import calendar
import json
from dataclasses import dataclass, field
from pathlib import Path

from tests.builders import NEVER_EVICT_MS
from tests.scenario_data import load_scenario
from tests.support.replay import without_completeness
from trellis.otlp.bodies import LogsBody, TracesBody, parse_otlp_body
from trellis.otlp.source import OtlpSource
from trellis.runtime.store import Store

TESTS_DIRECTORY = Path(__file__).resolve().parents[1]
FIXTURE_DIRECTORY = TESTS_DIRECTORY / "fixtures" / "otlp"
PAYLOAD_DIRECTORY = TESTS_DIRECTORY / "payloads" / "otlp"
BASE_MS = calendar.timegm((2026, 9, 28, 11, 0, 0)) * 1000
SECOND = 1000
REFRESH_LIMIT_MS = 660_000


def nano(milliseconds: int) -> str:
    return str(milliseconds * 1_000_000)


def string_attributes(pairs: dict[str, str]) -> list[dict[str, object]]:
    return [
        {"key": key, "value": {"stringValue": value}} for key, value in pairs.items()
    ]


def generated_body(spec: dict[str, object]) -> dict[str, object]:
    first = spec["from"]
    last = spec["to"]
    assert isinstance(first, int) and isinstance(last, int)
    session = str(spec["session"])
    if spec["kind"] == "spans":
        spans: list[dict[str, object]] = []
        for index in range(first, last):
            span: dict[str, object] = {
                "traceId": f"T-{session}",
                "spanId": f"t{index}",
                "name": "execute_tool shell",
                "startTimeUnixNano": nano(BASE_MS + index * SECOND),
                "endTimeUnixNano": nano(BASE_MS + index * SECOND + 10),
                "attributes": string_attributes(
                    {
                        "gen_ai.operation.name": "execute_tool",
                        "gen_ai.conversation.id": session,
                        "gen_ai.tool.name": str(spec.get("label") or f"tool{index}"),
                    }
                ),
            }
            if spec.get("parent"):
                span["parentSpanId"] = spec["parent"]
            spans.append(span)
        return {
            "resourceSpans": [
                {
                    "resource": {
                        "attributes": string_attributes({"service.name": "codex"})
                    },
                    "scopeSpans": [{"spans": spans}],
                }
            ]
        }
    records = [
        {
            "timeUnixNano": nano(BASE_MS + index * SECOND),
            "attributes": string_attributes(
                {
                    "event.name": "claude_code.tool_result",
                    "session.id": session,
                    "tool_name": f"tool{index}",
                }
            ),
        }
        for index in range(first, last)
    ]
    return {
        "resourceLogs": [
            {
                "resource": {
                    "attributes": string_attributes({"service.name": "claude-code"})
                },
                "scopeLogs": [{"logRecords": records}],
            }
        ]
    }


def body_of(case: str, action: dict[str, object]) -> object:
    if "generate" in action:
        spec = action["generate"]
        assert isinstance(spec, dict)
        return generated_body(spec)
    return parse_otlp_body(
        (FIXTURE_DIRECTORY / case / str(action["file"])).read_text("utf-8")
    )


def brief(turn: dict | None) -> list | None:
    if turn is None:
        return None
    return [turn["kind"], turn.get("name", turn.get("text")), turn["at"]]


def projection_of(session: dict) -> dict:
    return {
        "live": session["live"],
        "t0": session["t0"],
        "endAt": session["endAt"],
        "agents": [
            {
                "id": agent["id"],
                "turns": len(agent["turns"]),
                "trimmed": agent.get("trimmed"),
                "first": brief(agent["turns"][0] if agent["turns"] else None),
                "last": brief(agent["turns"][-1] if agent["turns"] else None),
            }
            for agent in session["agents"]
        ],
    }


@dataclass
class Replay:
    source: OtlpSource
    store: Store
    clock: dict[str, float]
    logged: list[str] = field(default_factory=list)

    def accept(self, kind: str, body: object) -> object:
        try:
            if kind == "traces":
                return self.source.accept_traces(TracesBody.model_validate(body))
            return self.source.accept_logs(LogsBody.model_validate(body))
        except Exception:
            return {"threw": True}

    def session(self, session_id: str) -> dict | None:
        dumped = self.store.json_of(session_id)
        return None if dumped is None else json.loads(dumped)


def make_replay() -> Replay:
    store = Store()
    clock: dict[str, float] = {"now": 0}
    logged: list[str] = []
    source = OtlpSource(
        since_ms=NEVER_EVICT_MS,
        store=store,
        clock=lambda: clock["now"],
        log=logged.append,
    )
    return Replay(source=source, store=store, clock=clock, logged=logged)


def play(case: str) -> tuple[dict, list[dict]]:
    scenario = load_scenario("otlp", case)
    replay = make_replay()
    outputs: list[dict] = []
    for step in scenario["steps"]:
        replay.clock["now"] = step["now"]
        action = step["action"]
        before = len(replay.logged)
        returned: object = None
        if action["type"] == "refresh":
            replay.source.refresh()
        else:
            returned = replay.accept(action["type"], body_of(case, action))
        outputs.append(
            {
                "returned": returned,
                "logged": len(replay.logged) - before,
                "sessions": {
                    session_id: replay.session(session_id)
                    for session_id in scenario["ids"]
                },
            }
        )
    return scenario, outputs


def shown(scenario: dict, session: dict | None) -> dict | None:
    if session is None:
        return None
    if scenario["project"]:
        return projection_of(session)
    return without_completeness(session)


def payload_session(scenario: dict, session: dict | None) -> dict | None:
    if session is None or not scenario["project"]:
        return session
    return {
        **projection_of(session),
        "completeness": [agent["completeness"] for agent in session["agents"]],
    }


def final_sessions(case: str) -> dict[str, dict | None]:
    _, outputs = play(case)
    return outputs[-1]["sessions"]


def present(sessions: dict[str, dict | None], session_id: str) -> dict:
    session = sessions[session_id]
    assert session is not None
    return session


def final_session(case: str, session_id: str) -> dict:
    return present(final_sessions(case), session_id)


def tool_turns(agent: dict) -> dict[str, dict]:
    return {turn["name"]: turn for turn in agent["turns"] if turn["kind"] == "tool"}


def agent_names(session: dict) -> list[str]:
    return [agent["name"] for agent in session["agents"]]


def completeness_by_name(session: dict) -> dict[str, str]:
    return {agent["name"]: agent["completeness"] for agent in session["agents"]}


def agent_named(session: dict, name: str) -> dict:
    [agent] = [agent for agent in session["agents"] if agent["name"] == name]
    return agent


def projection(case: str, session_id: str) -> dict:
    return projection_of(final_session(case, session_id))
