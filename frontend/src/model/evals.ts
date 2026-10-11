export type EvalSide = "baseline" | "candidate";

export type GraderMethod = "executable" | "human-rubric" | "model-judge";

export type EvalStatus = "complete" | "in-progress";

export type EvalVariant = { id: string; label: string; version: string };

export type EvalVerdict =
  | { kind: "pass" }
  | { kind: "fail"; reason: string }
  | { kind: "unknown"; reason: string }
  | { kind: "not-eligible"; reason: string }
  | { kind: "running" };

export type EvalDelivered = { excerpt: string; citations: string[] };

export type EvalCheckOutcome = "pass" | "fail";

export type EvalCheck = { grader: string; version: string; method: string; outcome?: EvalCheckOutcome; result: string };

export type EvalRegrade = { grader: string; version: string; verdict: string; at: string };

export type EvalTrial = {
  attempt: number;
  verdict: EvalVerdict;
  delivered?: EvalDelivered;
  checks: EvalCheck[];
  regrades: EvalRegrade[];
  missing: string[];
};

export type EvalRequirement = { text: string; source: string };

export type EvalCase = {
  id: string;
  title: string;
  revision: string;
  capability: string;
  graderMethod: GraderMethod;
  requirement: EvalRequirement;
  baseline: EvalTrial[];
  candidate: EvalTrial[];
};

export type MeasureValue =
  | { unit: "trials"; passed: number; total: number }
  | { unit: "seconds"; median: number }
  | { unit: "calls"; median: number };

export type MeasureUnit = MeasureValue["unit"];

export type MeasureChange = { delta: number; low: number; high: number; method: string };

export type MeasureCoverage = { included: number; total: number; note?: string };

export type EvalMeasure =
  | {
      kind: "available";
      id: string;
      name: string;
      baseline: MeasureValue;
      candidate: MeasureValue;
      change: MeasureChange;
      coverage: MeasureCoverage;
    }
  | { kind: "unavailable"; id: string; name: string; reason: string };

export type EvalExperiment = {
  id: string;
  title: string;
  synthetic: boolean;
  status: EvalStatus;
  graderVersion: string;
  trialsPerCase: number;
  baseline: EvalVariant;
  candidate: EvalVariant;
  measures: EvalMeasure[];
  cases: EvalCase[];
};
