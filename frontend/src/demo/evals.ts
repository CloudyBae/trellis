import type {
  EvalCase,
  EvalCheck,
  EvalCheckOutcome,
  EvalDelivered,
  EvalExperiment,
  EvalMeasure,
  EvalRegrade,
  EvalSide,
  EvalTrial,
  GraderMethod,
} from "../model";

type Mark = "P" | "F" | "U" | "N" | "R";

type Graded = { delivered: EvalDelivered; result: string };

type CaseSpec = {
  id: string;
  title: string;
  revision: string;
  capability: string;
  graderMethod: GraderMethod;
  grader: string;
  requirement: { text: string; source: string };
  baseline: Mark[];
  candidate: Mark[];
  liveCandidate?: Mark[];
  pass: Graded;
  fail?: Graded & { reason: string };
  unknown?: Graded & { reason: string };
  notEligibleReason?: string;
  regrades?: { side: EvalSide; attempt: number; entries: EvalRegrade[] };
  missing?: { side: EvalSide; attempt: number; notes: string[] }[];
};

const GRADER_VERSION = "g3";
const TRIALS_PER_CASE = 3;
const METHOD = "paired bootstrap, 95%";

export const EVAL_MEASURE_SCOPES: Record<string, string[]> = {
  outcome: ["Task completion", "Context management", "Grounding", "Efficiency"],
  "workflow-compliance": ["Task completion", "Context management"],
  grounding: ["Grounding"],
  context: ["Context management"],
  "efficiency-time": ["Efficiency"],
  "efficiency-calls": ["Efficiency"],
};

const SPECS: CaseSpec[] = [
  {
    id: "api-change",
    title: "Deliver a working API change",
    revision: "v3",
    capability: "Task completion",
    graderMethod: "executable",
    grader: "api-change-tests",
    requirement: {
      text: "Add an available query parameter to GET /items so that ?available=true returns only items with stock above zero. Behavior without the parameter is unchanged.",
      source: "task-brief",
    },
    baseline: ["P", "P", "P"],
    candidate: ["P", "P", "P"],
    pass: {
      delivered: {
        excerpt: "Added the available parameter to the items handler and a test that checks both the filtered and the unfiltered response.",
        citations: ["src/routes/items.ts:42", "src/routes/items.test.ts:15"],
      },
      result: "9 of 9 assertions passed",
    },
    missing: [{ side: "candidate", attempt: 3, notes: ["Token counts not captured"] }],
  },
  {
    id: "repo-guidance",
    title: "Find the relevant repository guidance",
    revision: "v3",
    capability: "Task completion",
    graderMethod: "executable",
    grader: "guidance-trace-check",
    requirement: {
      text: "Read docs/testing.md before adding tests and follow its naming rule for test files.",
      source: "AGENTS.md",
    },
    baseline: ["P", "F", "P"],
    candidate: ["P", "F", "P"],
    pass: {
      delivered: {
        excerpt: "Opened docs/testing.md first, then named the new file items.filter.test.ts as the guide requires.",
        citations: ["docs/testing.md:12", "src/routes/items.filter.test.ts:1"],
      },
      result: "Guidance opened before the first edit; test file name matches the rule",
    },
    fail: {
      delivered: {
        excerpt: "Added src/routes/itemsFilter.spec.ts and ran the suite without opening docs/testing.md.",
        citations: ["src/routes/itemsFilter.spec.ts:1"],
      },
      result: "Guidance never opened; test file name breaks the rule",
      reason: "Test file named against docs/testing.md; the guidance was never opened.",
    },
  },
  {
    id: "latest-instruction",
    title: "Use the latest instruction",
    revision: "v2",
    capability: "Context management",
    graderMethod: "executable",
    grader: "rate-limit-value-check",
    requirement: {
      text: "Apply the updated rate limit: 100 requests per minute. The earlier limit of 60 is superseded.",
      source: "user-message-07",
    },
    baseline: ["P", "P", "P"],
    candidate: ["P", "F", "P"],
    pass: {
      delivered: {
        excerpt: "Set the limit to 100 requests per minute and noted in the change summary that the earlier value of 60 is superseded.",
        citations: ["src/middleware/rate-limit.ts:18"],
      },
      result: "Limit constant equals 100",
    },
    fail: {
      delivered: {
        excerpt: "Kept the limit at 60 requests per minute and wrote the new route test against that value.",
        citations: ["src/middleware/rate-limit.ts:18"],
      },
      result: "Expected limit 100, found 60",
      reason: "Delivered limit is 60 requests per minute; the requirement is 100.",
    },
  },
  {
    id: "handoff-constraints",
    title: "Carry constraints through a handoff",
    revision: "v3",
    capability: "Context management",
    graderMethod: "executable",
    grader: "handoff-diff-check",
    requirement: {
      text: "Tell the reviewer subagent not to modify files outside src/billing. The final change touches only that directory.",
      source: "task-brief",
    },
    baseline: ["P", "F", "F"],
    candidate: ["P", "P", "P"],
    pass: {
      delivered: {
        excerpt: "The handoff lists the src/billing-only constraint. The diff touches src/billing/invoice.ts and nothing else.",
        citations: ["src/billing/invoice.ts:77"],
      },
      result: "Handoff names the constraint; diff stays inside src/billing",
    },
    fail: {
      delivered: {
        excerpt: "The handoff describes the invoice rounding fix but not the directory limit. The reviewer also edited src/shared/money.ts.",
        citations: ["src/shared/money.ts:9"],
      },
      result: "Constraint missing from handoff; 1 file outside src/billing changed",
      reason: "Constraint missing from the handoff; the diff touches src/shared/money.ts.",
    },
  },
  {
    id: "compaction-requirements",
    title: "Keep requirements after compaction",
    revision: "v1",
    capability: "Context management",
    graderMethod: "executable",
    grader: "retry-limit-check",
    requirement: {
      text: "After the context is compacted, the delivered change still uses the retry limit of 5 stated at the start of the task.",
      source: "task-brief",
    },
    baseline: ["P", "P", "F"],
    candidate: ["N", "N", "N"],
    pass: {
      delivered: {
        excerpt: "Retry limit stays at 5 after the context was compacted.",
        citations: ["src/queue/retry.ts:11"],
      },
      result: "Retry limit equals 5",
    },
    fail: {
      delivered: {
        excerpt: "After compaction the retry limit became 3, the default in the retry helper.",
        citations: ["src/queue/retry.ts:11"],
      },
      result: "Expected retry limit 5, found 3",
      reason: "Delivered retry limit is 3; the requirement is 5.",
    },
    notEligibleReason: "Setup ineligible: the candidate host did not compact in this run",
    missing: [
      { side: "candidate", attempt: 1, notes: ["No compaction event in the trace"] },
      { side: "candidate", attempt: 2, notes: ["No compaction event in the trace"] },
      { side: "candidate", attempt: 3, notes: ["No compaction event in the trace"] },
    ],
  },
  {
    id: "source-evidence",
    title: "Support claims with source evidence",
    revision: "v2",
    capability: "Grounding",
    graderMethod: "human-rubric",
    grader: "evidence-rubric",
    requirement: {
      text: "Every claim about the failing build cites the log line or file it comes from.",
      source: "task-brief",
    },
    baseline: ["P", "P", "F"],
    candidate: ["P", "U", "P"],
    pass: {
      delivered: {
        excerpt: "The build fails because the lockfile is stale (ci.log:212). package-lock.json still pins the older compiler (package-lock.json:3).",
        citations: ["ci.log:212", "package-lock.json:3"],
      },
      result: "Rubric: 3 of 3 criteria met",
    },
    fail: {
      delivered: {
        excerpt: "The build fails because of a flaky network connection during install.",
        citations: [],
      },
      result: "Rubric: 1 of 3 criteria met",
      reason: "The claim cites no log line or file.",
    },
    unknown: {
      delivered: {
        excerpt: "The build fails because the lockfile is stale. The install step also retried twice before failing.",
        citations: ["ci.log:212"],
      },
      result: "Awaiting human label",
      reason: "Awaiting human label",
    },
  },
  {
    id: "missing-evidence",
    title: "Say when evidence is missing",
    revision: "v2",
    capability: "Grounding",
    graderMethod: "human-rubric",
    grader: "missing-evidence-rubric",
    requirement: {
      text: "If the log does not show the cause, say the cause is unknown instead of naming one.",
      source: "task-brief",
    },
    baseline: ["P", "F", "P"],
    candidate: ["P", "P", "P"],
    liveCandidate: ["P", "P", "R"],
    pass: {
      delivered: {
        excerpt: "The log ends before the failure, so the cause cannot be determined from it. I did not name one.",
        citations: ["ci.log:240"],
      },
      result: "Rubric: 3 of 3 criteria met",
    },
    fail: {
      delivered: {
        excerpt: "The failure was caused by a timeout in the deploy step.",
        citations: ["ci.log:240"],
      },
      result: "Rubric: 1 of 3 criteria met",
      reason: "Names a cause the log does not support.",
    },
    regrades: {
      side: "candidate",
      attempt: 1,
      entries: [
        { grader: "missing-evidence-rubric", version: "g2", verdict: "failed", at: "2026-10-08 16:20" },
        { grader: "missing-evidence-rubric", version: "g3", verdict: "passed", at: "2026-10-09 09:41" },
      ],
    },
  },
  {
    id: "tool-budget",
    title: "Finish within the tool budget",
    revision: "v1",
    capability: "Efficiency",
    graderMethod: "executable",
    grader: "tool-call-budget-check",
    requirement: {
      text: "Complete the change using at most 15 tool calls.",
      source: "task-brief",
    },
    baseline: ["N", "P", "P"],
    candidate: ["P", "F", "P"],
    liveCandidate: ["R", "R", "R"],
    pass: {
      delivered: {
        excerpt: "Finished the change in 11 tool calls.",
        citations: [],
      },
      result: "11 tool calls; budget is 15",
    },
    fail: {
      delivered: {
        excerpt: "Finished the change after 19 tool calls, 8 of them repeated searches.",
        citations: [],
      },
      result: "19 tool calls; budget is 15",
      reason: "19 tool calls used; the budget is 15.",
    },
    notEligibleReason: "Excluded: provider outage during the trial, declared before analysis",
    missing: [{ side: "baseline", attempt: 1, notes: ["Partial trace kept; provider outage ended the trial"] }],
  },
];

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) {
    throw new Error(`Missing eval fixture content: ${what}`);
  }
  return value;
}

function check(spec: CaseSpec, result: string, outcome?: EvalCheckOutcome): EvalCheck {
  const base = { grader: spec.grader, version: GRADER_VERSION, method: spec.graderMethod, result };
  return outcome === undefined ? base : { ...base, outcome };
}

function buildTrial(spec: CaseSpec, side: EvalSide, attempt: number, mark: Mark): EvalTrial {
  const regrades = spec.regrades?.side === side && spec.regrades.attempt === attempt ? spec.regrades.entries : [];
  const missing = spec.missing?.find((entry) => entry.side === side && entry.attempt === attempt)?.notes ?? [];
  const common = { attempt, regrades, missing };
  switch (mark) {
    case "P":
      return {
        ...common,
        verdict: { kind: "pass" },
        delivered: spec.pass.delivered,
        checks: [check(spec, spec.pass.result, "pass")],
      };
    case "F": {
      const fail = required(spec.fail, `${spec.id} fail`);
      return {
        ...common,
        verdict: { kind: "fail", reason: fail.reason },
        delivered: fail.delivered,
        checks: [check(spec, fail.result, "fail")],
      };
    }
    case "U": {
      const unknown = required(spec.unknown, `${spec.id} unknown`);
      return {
        ...common,
        verdict: { kind: "unknown", reason: unknown.reason },
        delivered: unknown.delivered,
        checks: [check(spec, unknown.result)],
      };
    }
    case "N": {
      const reason = required(spec.notEligibleReason, `${spec.id} not eligible`);
      return { ...common, verdict: { kind: "not-eligible", reason }, checks: [check(spec, "Not graded")] };
    }
    case "R":
      return { ...common, verdict: { kind: "running" }, checks: [check(spec, "Pending: trial still running")] };
  }
}

function buildCase(spec: CaseSpec, live: boolean): EvalCase {
  const candidate = live ? (spec.liveCandidate ?? spec.candidate) : spec.candidate;
  return {
    id: spec.id,
    title: spec.title,
    revision: spec.revision,
    capability: spec.capability,
    graderMethod: spec.graderMethod,
    requirement: spec.requirement,
    baseline: spec.baseline.map((mark, index) => buildTrial(spec, "baseline", index + 1, mark)),
    candidate: candidate.map((mark, index) => buildTrial(spec, "candidate", index + 1, mark)),
  };
}

const RUNNING_REASON = "Experiment still running";

const WORKFLOW_COMPLIANCE: EvalMeasure = {
  kind: "available",
  id: "workflow-compliance",
  name: "Workflow compliance",
  baseline: { unit: "trials", passed: 9, total: 12 },
  candidate: { unit: "trials", passed: 10, total: 12 },
  change: { delta: 1, low: -2, high: 4, method: METHOD },
  coverage: { included: 4, total: 5 },
};

const CONTEXT: EvalMeasure = { kind: "unavailable", id: "context", name: "Context", reason: "No trace captured for compaction cases" };

const COMPLETE_MEASURES: EvalMeasure[] = [
  {
    kind: "available",
    id: "outcome",
    name: "Outcome",
    baseline: { unit: "trials", passed: 15, total: 20 },
    candidate: { unit: "trials", passed: 17, total: 20 },
    change: { delta: 2, low: -1, high: 5, method: METHOD },
    coverage: { included: 7, total: 8 },
  },
  WORKFLOW_COMPLIANCE,
  {
    kind: "available",
    id: "grounding",
    name: "Grounding",
    baseline: { unit: "trials", passed: 4, total: 6 },
    candidate: { unit: "trials", passed: 5, total: 5 },
    change: { delta: 1, low: -1, high: 3, method: METHOD },
    coverage: { included: 2, total: 2, note: "1 trial awaiting a human label" },
  },
  CONTEXT,
  {
    kind: "available",
    id: "efficiency-time",
    name: "Efficiency, wall time",
    baseline: { unit: "seconds", median: 124 },
    candidate: { unit: "seconds", median: 98 },
    change: { delta: -26, low: -41, high: 8, method: METHOD },
    coverage: { included: 1, total: 1 },
  },
  {
    kind: "available",
    id: "efficiency-calls",
    name: "Efficiency, tool calls",
    baseline: { unit: "calls", median: 13 },
    candidate: { unit: "calls", median: 11 },
    change: { delta: -2, low: -5, high: 1, method: METHOD },
    coverage: { included: 1, total: 1 },
  },
];

const LIVE_MEASURES: EvalMeasure[] = [
  { kind: "unavailable", id: "outcome", name: "Outcome", reason: RUNNING_REASON },
  WORKFLOW_COMPLIANCE,
  { kind: "unavailable", id: "grounding", name: "Grounding", reason: RUNNING_REASON },
  CONTEXT,
  { kind: "unavailable", id: "efficiency-time", name: "Efficiency, wall time", reason: RUNNING_REASON },
  { kind: "unavailable", id: "efficiency-calls", name: "Efficiency, tool calls", reason: RUNNING_REASON },
];

function buildExperiment(live: boolean): EvalExperiment {
  return {
    id: live ? "workflow-essentials-live" : "workflow-essentials",
    title: "Workflow essentials",
    synthetic: true,
    status: live ? "in-progress" : "complete",
    graderVersion: GRADER_VERSION,
    trialsPerCase: TRIALS_PER_CASE,
    baseline: { id: "baseline", label: "Baseline", version: "v0.8" },
    candidate: { id: "candidate", label: "Candidate", version: "v0.9 context handoff" },
    measures: structuredClone(live ? LIVE_MEASURES : COMPLETE_MEASURES),
    cases: SPECS.map((spec) => buildCase(spec, live)),
  };
}

export function createEvalDemo(): EvalExperiment {
  return buildExperiment(false);
}

export function createLiveEvalDemo(): EvalExperiment {
  return buildExperiment(true);
}
