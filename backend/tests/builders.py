from trellis.sessions.models import Agent, Run, Session, Turn, Via

NEVER_EVICT_MS = 10**15


def make_agent(agent_id: int = 1, turns: list[Turn] | None = None) -> Agent:
    return Agent(
        id=agent_id,
        name="Main agent",
        src="Claude Code",
        start=0,
        task="Do the thing",
        context=[],
        turns=turns or [],
        completeness="complete",
    )


def make_session(
    session_id: str,
    raw_id: str,
    t0: int = 0,
    via: Via | None = None,
    agent_count: int = 1,
) -> Session:
    run = Run(name="Run", repo="repo", source="Claude Code", file="file")
    agents = [make_agent(number + 1) for number in range(agent_count)]
    if via is None:
        return Session(
            id=session_id,
            raw_id=raw_id,
            live=False,
            t0=t0,
            end_at=0,
            run=run,
            agents=agents,
        )
    return Session(
        id=session_id,
        raw_id=raw_id,
        live=False,
        t0=t0,
        end_at=0,
        via=via,
        run=run,
        agents=agents,
    )
