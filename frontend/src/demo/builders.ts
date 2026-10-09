import type { Agent } from "../api";
import { prepareAgents } from "../model";
import type { DemoSession } from "../model";

export type DemoAgentSpec = Omit<Agent, "completeness">;

type ToolExtras = { fail?: boolean; pending?: boolean };

export type DemoRunSpec = {
  id: string;
  name: string;
  repo: string;
  source: string;
  file: string;
  clock0: number;
  agents: DemoAgentSpec[];
};

export function tool(
  at: number,
  name: string,
  target: string,
  ms: number | null,
  out: string,
  extras: ToolExtras = {},
): Agent["turns"][number] {
  return { at, kind: "tool", name, target, ms, out, ...extras };
}

export function message(at: number, text: string): Agent["turns"][number] {
  return { at, kind: "msg", text };
}

export function clockSeconds(hours: number, minutes: number, seconds: number): number {
  return hours * 3600 + minutes * 60 + seconds;
}

type DemoTiming = { replay: true; endAt: number } | { replay: false; nowAt: number; live: boolean };

export function buildDemoSession(spec: DemoRunSpec, timing: DemoTiming): DemoSession {
  const { agents, by } = prepareAgents(
    spec.agents.map((agent): Agent => ({ ...agent, completeness: "complete" })),
  );
  const run = {
    name: spec.name,
    repo: spec.repo,
    source: spec.source,
    file: spec.file,
    clock0: spec.clock0,
  };
  if (timing.replay) {
    return {
      real: false,
      id: spec.id,
      live: true,
      replay: true,
      t0: 0,
      endAt: timing.endAt,
      nowAt: 0,
      run,
      agents,
      by,
    };
  }
  return {
    real: false,
    id: spec.id,
    live: timing.live,
    replay: false,
    t0: 0,
    endAt: timing.nowAt,
    nowAt: timing.nowAt,
    run,
    agents,
    by,
  };
}
