import type { Session } from "../api";
import { activity, alive, ancestry, ended, signature, stateOf, turnsOf } from "./agents";
import { layout } from "./layout";
import { sessionNow, toRealSession } from "./sessions";
import type { Layout, PreparedAgent, TimelineTurn } from "./types";

const MAX_AGENTS_FOR_BOUNDARY_TIMES = 6;
const REVISION = 7;

function timesFor(session: Session): number[] {
  const times = new Set([
    -1,
    0,
    Math.floor(session.endAt / 2),
    Math.floor(session.endAt / 4),
    session.endAt,
    session.endAt + 100,
  ]);
  if (session.agents.length <= MAX_AGENTS_FOR_BOUNDARY_TIMES) {
    session.agents.forEach((agent) => {
      times.add(agent.start);
      if (agent.end != null) {
        times.add(agent.end);
      }
    });
  }
  return [...times].sort((left, right) => left - right);
}

function describeTurns(agent: PreparedAgent, turns: TimelineTurn[]): unknown[] {
  const positions = new Map<TimelineTurn, number>(agent.turns.map((turn, index) => [turn, index]));
  return turns.map((turn) => {
    const index = positions.get(turn);
    return index === undefined ? turn : { at: turn.at, kind: turn.kind, index };
  });
}

function describeLayout(laidOut: Layout): unknown {
  return {
    ...laidOut,
    rows: laidOut.rows.map((row) => (row.type === "now" ? row : { ...row, a: row.a.id })),
  };
}

export function describeSession(session: Session): unknown {
  const real = toRealSession(session, REVISION);
  const { agents, by } = real;
  const selectable = agents.find((agent) => agent.context.length > 0);
  const selections = selectable ? [null, selectable.id] : [null];
  const clocks = [
    session.t0 - 3000,
    session.t0 + 1234,
    session.t0 + session.endAt * 1000 + 500,
    session.t0 + (session.endAt + 50) * 1000,
  ];
  return {
    id: real.id,
    nowAt: real.nowAt,
    order: agents.map((agent) => agent.id),
    kids: Object.fromEntries(agents.map((agent) => [agent.id, agent.kids])),
    sessionNow: clocks.map((clockNow) => ({ clockNow, value: sessionNow(real, clockNow, 0) })),
    ancestry: Object.fromEntries(
      agents.map((agent) => [agent.id, [...ancestry(by, agent.id)].sort((left, right) => left - right)]),
    ),
    snapshots: timesFor(session).map((time) => ({
      time,
      agents: agents.map((agent) => ({
        id: agent.id,
        alive: alive(agent, time),
        ended: ended(agent, time),
        state: stateOf(agent, time),
        turns: describeTurns(agent, turnsOf(agent, time)),
        activity: activity(agent, time),
      })),
      signatureWithRevision: signature(agents, time, REVISION),
      signatureWithoutRevision: signature(agents, time, undefined),
      layouts: [false, true].flatMap((narrow) =>
        selections.map((selected) => ({
          narrow,
          selected,
          layout: describeLayout(layout(agents, time, narrow, selected)),
        })),
      ),
    })),
  };
}
