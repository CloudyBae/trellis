import type { PreparedAgent } from "./types";

export const MAX_TOOL_LEAVES = 4;

export type LeafState = "ok" | "failed" | "pending";

export type ToolLeaves = { states: LeafState[]; total: number };

function leafState(turn: { fail?: boolean | null; pending?: boolean | null }): LeafState {
  if (turn.fail) {
    return "failed";
  }
  return turn.pending ? "pending" : "ok";
}

export function failedCalls(agent: PreparedAgent, time: number): number {
  return agent.turns.filter((turn) => turn.kind === "tool" && turn.at <= time && turn.fail).length;
}

export function toolLeaves(agent: PreparedAgent, time: number): ToolLeaves {
  const calls = agent.turns.flatMap((turn) => (turn.kind === "tool" && turn.at <= time ? [leafState(turn)] : []));
  const ranked = calls
    .map((state, index) => ({ state, index }))
    .sort((left, right) => Number(right.state === "failed") - Number(left.state === "failed") || right.index - left.index);
  const shown = ranked.slice(0, MAX_TOOL_LEAVES).sort((left, right) => left.index - right.index);
  return { states: shown.map((call) => call.state), total: calls.length };
}
