import type { Agent } from "../api";
import { prepareAgents } from "./agents";
import type { PreparedAgent } from "./types";

export function agentOf(id: number, overrides: Partial<Agent> = {}): Agent {
  return {
    id,
    name: `Agent ${id}`,
    src: "Claude Code",
    start: 0,
    task: `task ${id}`,
    context: [],
    turns: [],
    completeness: "complete",
    ...overrides,
  };
}

export function preparedOf(agents: Agent[]): PreparedAgent[] {
  return prepareAgents(agents).agents;
}
