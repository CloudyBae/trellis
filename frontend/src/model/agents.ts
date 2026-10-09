import type { Agent } from "../api";
import { assertNever } from "./exhaustive";
import { listAnd, plainName } from "./text";
import type { AgentIndex, AgentState, PreparedAgent, TimelineTurn } from "./types";

export function prepareAgents(agents: Agent[]): { agents: PreparedAgent[]; by: AgentIndex } {
  const by: AgentIndex = {};
  const prepared = [...agents]
    .sort((left, right) => left.id - right.id)
    .map((agent): PreparedAgent => {
      const preparedAgent: PreparedAgent = { ...agent, by, kids: [] };
      by[preparedAgent.id] = preparedAgent;
      return preparedAgent;
    });
  prepared.forEach((agent) => {
    agent.kids = prepared
      .filter((kid) => kid.parent === agent.id)
      .sort((left, right) => left.start - right.start)
      .map((kid) => kid.id);
  });
  return { agents: prepared, by };
}

export function kidsOf(agent: PreparedAgent): PreparedAgent[] {
  return agent.kids.flatMap((id) => {
    const kid = agent.by[id];
    return kid === undefined ? [] : [kid];
  });
}

export function alive(agent: PreparedAgent, time: number): boolean {
  return agent.start <= time;
}

export function ended(agent: PreparedAgent, time: number): boolean {
  return agent.end != null && agent.end <= time;
}

export function stateOf(agent: PreparedAgent, time: number): AgentState {
  if (ended(agent, time)) {
    return { s: agent.final ?? "complete" };
  }
  const phase = (agent.phases ?? []).filter((candidate) => candidate.at <= time).pop();
  if (phase) {
    return { s: phase.state, note: phase.note };
  }
  const working = kidsOf(agent).filter((kid) => alive(kid, time) && !ended(kid, time));
  if (working.length) {
    const names = working.map((kid) =>
      working.filter((other) => other.name === kid.name).length > 1 ? plainName(kid) : kid.name,
    );
    return { s: "waiting", note: `Waiting on ${listAnd(names)} to return.` };
  }
  return { s: "running" };
}

export function isSettled(state: AgentState): boolean {
  switch (state.s) {
    case "complete":
    case "failed":
      return true;
    case "running":
    case "waiting":
    case "blocked":
      return false;
    default:
      return assertNever(state);
  }
}

export function turnsOf(agent: PreparedAgent, time: number): TimelineTurn[] {
  const own: TimelineTurn[] = agent.turns.filter((turn) => turn.at <= time);
  const delegated: TimelineTurn[] = [];
  kidsOf(agent).forEach((kid) => {
    if (alive(kid, time)) {
      delegated.push({ at: kid.start, kind: "delegate", to: kid.id });
    }
    if (ended(kid, time) && kid.end != null) {
      delegated.push({ at: kid.end, kind: "result", from: kid.id });
    }
  });
  return [...own, ...delegated].sort((left, right) => left.at - right.at);
}

export function activity(agent: PreparedAgent, time: number): string {
  const last = agent.turns.filter((turn) => turn.at <= time).pop();
  if (!last) {
    return agent.brief || agent.task;
  }
  switch (last.kind) {
    case "tool":
      return `${last.name} ${last.target}`;
    case "user":
      return `You: ${last.text}`;
    case "msg":
      return last.text;
    default:
      return assertNever(last);
  }
}

export function ancestry(by: AgentIndex, id: number): Set<number> {
  const ids = new Set<number>();
  let agent = by[id];
  while (agent) {
    ids.add(agent.id);
    agent = agent.parent == null ? undefined : by[agent.parent];
  }
  return ids;
}

export function signature(agents: PreparedAgent[], time: number, rev: number | undefined): string {
  const parts = agents
    .filter((agent) => alive(agent, time))
    .map((agent) => {
      const settled = ended(agent, time) ? "e" : "";
      const turnCount = agent.turns.filter((turn) => turn.at <= time).length;
      return `${agent.id}${stateOf(agent, time).s}${settled}:${turnCount}`;
    });
  return parts.join("|") + (rev || "");
}
