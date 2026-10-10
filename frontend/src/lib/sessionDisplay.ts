import { alive, sessionNow, stateOf } from "@/model";
import type { AgentStateName, ModelSession, PreparedAgent } from "@/model";
import type { Clock } from "./clock";
import { clockAt, duration } from "./format";

export type SessionSummary = {
  time: number;
  states: { agent: PreparedAgent; state: AgentStateName }[];
  rootState: AgentStateName;
  blocked: PreparedAgent[];
  failed: PreparedAgent[];
  running: number;
};

export type SessionOrder = {
  active: ModelSession[];
  past: ModelSession[];
  all: ModelSession[];
};

export type AttentionAlert = { kind: "blocked" | "failed" | "none"; why: string; count: number };

export type NoteTone = "blocked" | "failed" | "plain";

export type MenuEntry = {
  session: ModelSession;
  live: boolean;
  worst: AgentStateName;
  when: { text: string; ticking: boolean };
  note: { text: string; tone: NoteTone };
};

export function timeOf(session: ModelSession, clock: Clock): number {
  return sessionNow(session, clock.clockMs, clock.tick);
}

export function isLive(session: ModelSession, clock: Clock): boolean {
  if (!session.real && session.replay) {
    return timeOf(session, clock) < session.endAt;
  }
  return session.live;
}

export function summarize(session: ModelSession, clock: Clock): SessionSummary {
  const time = timeOf(session, clock);
  const states = session.agents
    .filter((agent) => alive(agent, time))
    .map((agent) => ({ agent, state: stateOf(agent, time).s }));
  const root = session.by[1];
  return {
    time,
    states,
    rootState: root === undefined ? "running" : stateOf(root, time).s,
    blocked: states.filter((entry) => entry.state === "blocked").map((entry) => entry.agent),
    failed: states.filter((entry) => entry.state === "failed").map((entry) => entry.agent),
    running: states.filter((entry) => entry.state === "running").length,
  };
}

function startKey(session: ModelSession): number {
  return session.real ? session.t0 / 1000 : session.run.clock0;
}

export function orderSessions(sessions: ModelSession[], clock: Clock): SessionOrder {
  const needsYou = (session: ModelSession) => Number(summarize(session, clock).blocked.length > 0);
  const active = sessions
    .filter((session) => isLive(session, clock))
    .sort(
      (left, right) => needsYou(right) - needsYou(left) || startKey(right) - startKey(left),
    );
  const past = sessions
    .filter((session) => !isLive(session, clock))
    .sort((left, right) => startKey(right) - startKey(left));
  return { active, past, all: [...active, ...past] };
}

export function isToday(session: ModelSession): boolean {
  return (
    !session.real ||
    new Date(session.t0 + session.endAt * 1000).toDateString() === new Date().toDateString()
  );
}

export function attentionAlert(
  sessions: ModelSession[],
  current: ModelSession,
  clock: Clock,
): AttentionAlert {
  const others = sessions
    .filter((session) => session.id !== current.id && isLive(session, clock))
    .map((session) => ({ session, summary: summarize(session, clock) }));
  const blocked = others.filter((entry) => entry.summary.blocked.length > 0);
  const [firstBlocked] = blocked;
  if (firstBlocked !== undefined) {
    const why =
      blocked.length === 1
        ? `${firstBlocked.session.run.name} needs you`
        : `${blocked.length} other runs need you`;
    return { kind: "blocked", why, count: blocked.length };
  }
  const failed = others.filter((entry) => entry.summary.failed.length > 0);
  const [firstFailed] = failed;
  if (firstFailed !== undefined) {
    const why =
      failed.length === 1
        ? `${firstFailed.session.run.name} has a failed agent`
        : `${failed.length} other runs have a failed agent`;
    return { kind: "failed", why, count: failed.length };
  }
  return { kind: "none", why: "", count: 0 };
}

export function defaultSelection(
  session: ModelSession,
  narrow: boolean,
  clock: Clock,
): number | null {
  if (narrow) {
    return null;
  }
  const summary = summarize(session, clock);
  const pick =
    summary.blocked[0] ??
    summary.states.find((entry) => entry.state === "failed")?.agent ??
    summary.states.find((entry) => entry.state === "running")?.agent ??
    session.by[1];
  return pick?.id ?? null;
}

function whenText(session: ModelSession, live: boolean, time: number): MenuEntry["when"] {
  if (live) {
    return { text: duration(time), ticking: true };
  }
  const endedAt = clockAt(session.run.clock0, time).slice(0, 5);
  if (session.real && !isToday(session)) {
    const weekday = new Date(session.t0 + time * 1000).toLocaleDateString(undefined, {
      weekday: "short",
    });
    return { text: `ended ${weekday} ${endedAt}`, ticking: false };
  }
  return { text: `ended ${endedAt}`, ticking: false };
}

function noteFor(session: ModelSession, live: boolean, summary: SessionSummary): MenuEntry["note"] {
  if (summary.blocked.length) {
    return {
      text: `Needs you: ${summary.blocked.map((agent) => agent.name).join(", ")}`,
      tone: "blocked",
    };
  }
  if (!live) {
    return {
      text: session.by[1]?.returned?.summary ?? "",
      tone: summary.rootState === "failed" ? "failed" : "plain",
    };
  }
  if (summary.failed.length) {
    const failed = summary.failed.length;
    return {
      text: `${failed} agent${failed === 1 ? "" : "s"} failed, ${summary.running} running`,
      tone: "failed",
    };
  }
  return { text: `${summary.running} running`, tone: "plain" };
}

function worstState(live: boolean, summary: SessionSummary): AgentStateName {
  if (summary.blocked.length) {
    return "blocked";
  }
  if (summary.failed.length || (!live && summary.rootState === "failed")) {
    return "failed";
  }
  if (live) {
    return summary.running ? "running" : "waiting";
  }
  return "complete";
}

export function describeEntry(session: ModelSession, clock: Clock): MenuEntry {
  const summary = summarize(session, clock);
  const live = isLive(session, clock);
  return {
    session,
    live,
    worst: worstState(live, summary),
    when: whenText(session, live, summary.time),
    note: noteFor(session, live, summary),
  };
}
