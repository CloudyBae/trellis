import { describe, expect, it } from "vitest";
import type { EvalCase, EvalExperiment, EvalMeasure, EvalSide } from "../model";
import { caseChange, eligibleCount, finishedCount, passedCount } from "../lib/evals";
import { EVAL_MEASURE_SCOPES, createEvalDemo, createLiveEvalDemo } from "./evals";

const SUITE_ORDER = [
  "Deliver a working API change",
  "Find the relevant repository guidance",
  "Use the latest instruction",
  "Carry constraints through a handoff",
  "Keep requirements after compaction",
  "Support claims with source evidence",
  "Say when evidence is missing",
  "Finish within the tool budget",
];

const SIDES: EvalSide[] = ["baseline", "candidate"];

function nth<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`No item at ${index}`);
  }
  return item;
}

function inScope(experiment: EvalExperiment, measureId: string): EvalCase[] {
  const families = EVAL_MEASURE_SCOPES[measureId];
  if (families === undefined) {
    throw new Error(`No scope for ${measureId}`);
  }
  return experiment.cases.filter((evalCase) => families.includes(evalCase.capability));
}

function available(experiment: EvalExperiment): Extract<EvalMeasure, { kind: "available" }>[] {
  return experiment.measures.flatMap((measure) => (measure.kind === "available" ? [measure] : []));
}

describe("eval fixture", () => {
  const complete = createEvalDemo();
  const live = createLiveEvalDemo();

  it("is labeled synthetic and pinned to the settled header facts", () => {
    for (const experiment of [complete, live]) {
      expect(experiment.synthetic).toBe(true);
      expect(experiment.title).toBe("Workflow essentials");
      expect(experiment.graderVersion).toBe("g3");
      expect(experiment.trialsPerCase).toBe(3);
      expect(experiment.baseline).toMatchObject({ label: "Baseline", version: "v0.8" });
      expect(experiment.candidate).toMatchObject({ label: "Candidate", version: "v0.9 context handoff" });
    }
    expect(complete.status).toBe("complete");
    expect(live.status).toBe("in-progress");
  });

  it("keeps the suite order and four capability families", () => {
    for (const experiment of [complete, live]) {
      expect(experiment.cases.map((evalCase) => evalCase.title)).toEqual(SUITE_ORDER);
      expect([...new Set(experiment.cases.map((evalCase) => evalCase.capability))]).toEqual([
        "Task completion",
        "Context management",
        "Grounding",
        "Efficiency",
      ]);
    }
  });

  it("orders measures as the strip expects", () => {
    expect(complete.measures.map((measure) => measure.name)).toEqual([
      "Outcome",
      "Workflow compliance",
      "Grounding",
      "Context",
      "Efficiency, wall time",
      "Efficiency, tool calls",
    ]);
    expect(live.measures.map((measure) => measure.id)).toEqual(complete.measures.map((measure) => measure.id));
  });

  it("gives every case trialsPerCase numbered trials per side", () => {
    for (const experiment of [complete, live]) {
      for (const evalCase of experiment.cases) {
        for (const side of SIDES) {
          expect(
            evalCase[side].map((trial) => trial.attempt),
            `${evalCase.title} ${side}`,
          ).toEqual(Array.from({ length: experiment.trialsPerCase }, (_, index) => index + 1));
        }
      }
    }
  });

  it("gives every trial checks that match its case grader and the experiment grader version", () => {
    for (const experiment of [complete, live]) {
      for (const evalCase of experiment.cases) {
        for (const trial of [...evalCase.baseline, ...evalCase.candidate]) {
          expect(trial.checks.length, evalCase.title).toBeGreaterThan(0);
          for (const check of trial.checks) {
            expect(check.method).toBe(evalCase.graderMethod);
            expect(check.version).toBe(experiment.graderVersion);
          }
        }
      }
    }
  });

  it("records a check outcome only where the trial was graded, consistent with its verdict", () => {
    for (const experiment of [complete, live]) {
      for (const evalCase of experiment.cases) {
        for (const trial of [...evalCase.baseline, ...evalCase.candidate]) {
          const expected = trial.verdict.kind === "pass" ? "pass" : trial.verdict.kind === "fail" ? "fail" : undefined;
          for (const check of trial.checks) {
            expect(check.outcome, `${evalCase.title} attempt ${trial.attempt}`).toBe(expected);
          }
        }
      }
    }
  });

  it("derives every available trials measure from the comparable cases in its scope", () => {
    const trialMeasures = available(complete).filter((measure) => measure.baseline.unit === "trials");
    expect(trialMeasures.map((measure) => measure.id)).toEqual(["outcome", "workflow-compliance", "grounding"]);
    for (const measure of trialMeasures) {
      const cases = inScope(complete, measure.id).filter((evalCase) => caseChange(evalCase).kind !== "not-comparable");
      for (const side of SIDES) {
        const value = measure[side];
        if (value.unit !== "trials") {
          throw new Error(`${measure.id} ${side} is not in trials`);
        }
        expect(value.passed, `${measure.id} ${side} passed`).toBe(
          cases.reduce((sum, evalCase) => sum + passedCount(evalCase[side]), 0),
        );
        expect(value.total, `${measure.id} ${side} total`).toBe(
          cases.reduce((sum, evalCase) => sum + finishedCount(evalCase[side]), 0),
        );
      }
    }
  });

  it("never lets the shown values contradict the change words", () => {
    for (const measure of available(complete).filter((item) => item.baseline.unit === "trials")) {
      if (measure.baseline.unit !== "trials" || measure.candidate.unit !== "trials") {
        throw new Error(`${measure.id} is not in trials`);
      }
      expect(measure.candidate.passed - measure.baseline.passed, measure.id).toBe(measure.change.delta);
    }
  });

  it("derives each trials change and coverage from the comparable cases", () => {
    for (const measure of available(complete).filter((item) => item.baseline.unit === "trials")) {
      const cases = inScope(complete, measure.id);
      const comparable = cases.filter((evalCase) => caseChange(evalCase).kind !== "not-comparable");
      const delta = comparable.reduce(
        (sum, evalCase) => sum + passedCount(evalCase.candidate) - passedCount(evalCase.baseline),
        0,
      );
      expect(measure.change.delta, `${measure.id} delta`).toBe(delta);
      expect(measure.coverage, `${measure.id} coverage`).toMatchObject({
        included: comparable.length,
        total: cases.length,
      });
      expect(measure.change.low).toBeLessThanOrEqual(measure.change.delta);
      expect(measure.change.high).toBeGreaterThanOrEqual(measure.change.delta);
    }
  });

  it("keeps efficiency measures in seconds and calls with a median inside the interval-consistent change", () => {
    const time = available(complete).find((measure) => measure.id === "efficiency-time");
    const calls = available(complete).find((measure) => measure.id === "efficiency-calls");
    if (time?.baseline.unit !== "seconds" || time.candidate.unit !== "seconds") {
      throw new Error("efficiency-time must be in seconds");
    }
    if (calls?.baseline.unit !== "calls" || calls.candidate.unit !== "calls") {
      throw new Error("efficiency-calls must be in calls");
    }
    expect(time.change.delta).toBe(time.candidate.median - time.baseline.median);
    expect(calls.change.delta).toBe(calls.candidate.median - calls.baseline.median);
  });

  it("keeps a coverage note only where the data adds something the coverage count does not say", () => {
    const notes = Object.fromEntries(available(complete).map((measure) => [measure.id, measure.coverage.note]));
    expect(notes).toEqual({
      outcome: undefined,
      "workflow-compliance": undefined,
      grounding: "1 trial awaiting a human label",
      "efficiency-time": undefined,
      "efficiency-calls": undefined,
    });
  });

  it("marks context unavailable with a reason instead of a zero", () => {
    const context = complete.measures.find((measure) => measure.id === "context");
    expect(context).toEqual({
      kind: "unavailable",
      id: "context",
      name: "Context",
      reason: "No trace captured for compaction cases",
    });
  });

  it("includes the regression, the improvement, the non-comparable case, the pending label, the regrade and the exclusion", () => {
    const byTitle = (title: string) => {
      const found = complete.cases.find((evalCase) => evalCase.title === title);
      if (found === undefined) {
        throw new Error(title);
      }
      return found;
    };
    const latest = byTitle("Use the latest instruction");
    expect(latest.candidate.map((trial) => trial.verdict.kind)).toEqual(["pass", "fail", "pass"]);
    expect(latest.requirement).toEqual({
      text: "Apply the updated rate limit: 100 requests per minute. The earlier limit of 60 is superseded.",
      source: "user-message-07",
    });
    expect(nth(latest.candidate, 1).delivered?.excerpt).toContain("60 requests per minute");
    expect(nth(latest.candidate, 1).delivered?.citations).toContain("src/middleware/rate-limit.ts:18");
    expect(byTitle("Carry constraints through a handoff").baseline.map((trial) => trial.verdict.kind)).toEqual([
      "pass",
      "fail",
      "fail",
    ]);
    expect(eligibleCount(byTitle("Keep requirements after compaction").candidate)).toBe(0);
    expect(nth(byTitle("Support claims with source evidence").candidate, 1).verdict).toEqual({
      kind: "unknown",
      reason: "Awaiting human label",
    });
    const regraded = byTitle("Say when evidence is missing").candidate.filter((trial) => trial.regrades.length > 0);
    expect(regraded).toHaveLength(1);
    expect(nth(regraded, 0).regrades.map((entry) => [entry.version, entry.verdict])).toEqual([
      ["g2", "failed"],
      ["g3", "passed"],
    ]);
    expect(nth(regraded, 0).verdict.kind).toBe("pass");
    expect(nth(byTitle("Finish within the tool budget").baseline, 0).verdict).toEqual({
      kind: "not-eligible",
      reason: "Excluded: provider outage during the trial, declared before analysis",
    });
  });

  it("has running trials in the live fixture and no available measure that depends on unfinished trials", () => {
    const running = live.cases.flatMap((evalCase) => evalCase.candidate).filter((trial) => trial.verdict.kind === "running");
    expect(running.length).toBeGreaterThan(0);
    for (const measure of available(live)) {
      for (const evalCase of inScope(live, measure.id)) {
        for (const trial of [...evalCase.baseline, ...evalCase.candidate]) {
          expect(["running", "unknown"], `${measure.id} ${evalCase.title}`).not.toContain(trial.verdict.kind);
        }
      }
    }
    expect(available(live).map((measure) => measure.id)).toEqual(["workflow-compliance"]);
    const unavailable = live.measures.filter((measure) => measure.kind === "unavailable");
    expect(unavailable.filter((measure) => measure.reason === "Experiment still running").length).toBeGreaterThan(0);
  });

  it("matches the complete fixture on finished trials of the live fixture", () => {
    for (const [index, evalCase] of live.cases.entries()) {
      expect(evalCase.baseline).toEqual(nth(complete.cases, index).baseline);
      for (const trial of evalCase.candidate) {
        if (trial.verdict.kind !== "running") {
          expect(trial).toEqual(nth(nth(complete.cases, index).candidate, trial.attempt - 1));
        }
      }
    }
  });

  it("returns independent copies on each call", () => {
    const outcome = available(createEvalDemo()).find((measure) => measure.id === "outcome");
    if (outcome === undefined) {
      throw new Error("outcome must be available");
    }
    outcome.change.delta = 99;
    const again = available(createEvalDemo()).find((measure) => measure.id === "outcome");
    expect(again?.change.delta).toBe(2);
  });
});
