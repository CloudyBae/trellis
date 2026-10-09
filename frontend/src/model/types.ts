import type { Agent, Session, Turn } from "../api";

type Phase = NonNullable<Agent["phases"]>[number];

export type AgentStateName = Phase["state"];

export type AgentState = {
  [Name in AgentStateName]: { s: Name; note?: string };
}[AgentStateName];

export type PreparedAgent = Agent & {
  by: AgentIndex;
  kids: number[];
};

export type AgentIndex = Record<number, PreparedAgent>;

export type PreparedRun = Session["run"] & { clock0: number };

export type RealSession = Omit<Session, "agents" | "run"> & {
  real: true;
  rev: number;
  nowAt: number;
  run: PreparedRun;
  agents: PreparedAgent[];
  by: AgentIndex;
};

export type DemoSession = {
  real: false;
  id: string;
  live: boolean;
  replay: boolean;
  t0: number;
  endAt: number;
  nowAt: number;
  run: PreparedRun;
  agents: PreparedAgent[];
  by: AgentIndex;
};

export type ModelSession = RealSession | DemoSession;

export type DelegateTurn = { at: number; kind: "delegate"; to: number };
export type ResultTurn = { at: number; kind: "result"; from: number };
export type TimelineTurn = Turn | DelegateTurn | ResultTurn;

export type LayoutEventType = "spawn" | "ret";

export type LayoutRow =
  | { type: LayoutEventType; a: PreparedAgent; t: number; y: number; h: number; cy: number }
  | { type: "now"; y: number; h: number; cy: number };

export type Layout = {
  rows: LayoutRow[];
  lane: Record<number, number>;
  height: number;
  textX: number;
  maxLane: number;
};

export type LayoutMetrics = {
  lane: number;
  x0: number;
  spawnHeight: number;
  returnHeight: number;
};
