import type { Session } from "../api";
import { prepareAgents } from "./agents";
import type { ModelSession, RealSession } from "./types";

export function toRealSession(session: Session, rev: number): RealSession {
  const start = new Date(session.t0);
  const { agents, by } = prepareAgents(session.agents);
  return {
    ...session,
    real: true,
    rev,
    nowAt: session.endAt,
    run: {
      ...session.run,
      clock0: start.getHours() * 3600 + start.getMinutes() * 60 + start.getSeconds(),
    },
    agents,
    by,
  };
}

export function sessionNow(session: ModelSession, clockMs: number, tick: number): number {
  if (session.real) {
    return session.live
      ? Math.max(session.endAt, Math.ceil((clockMs - session.t0) / 1000))
      : session.endAt;
  }
  if (session.replay) {
    return Math.max(0, tick - session.t0);
  }
  return session.live ? session.nowAt + tick : session.nowAt;
}
