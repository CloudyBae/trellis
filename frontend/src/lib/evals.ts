import { assertNever, listAnd } from "@/model";
import type {
  EvalCase,
  EvalExperiment,
  EvalSide,
  EvalTrial,
  EvalVerdict,
  GraderMethod,
  MeasureChange,
  MeasureUnit,
  MeasureValue,
} from "@/model";
import { duration } from "./format";

export type CaseChange =
  | { kind: "fewer" | "more"; by: number }
  | { kind: "same" }
  | { kind: "running"; count: number }
  | { kind: "not-comparable"; reason: string };

export type EvalFocus = { caseId: string; side: EvalSide; attempt: number };

export function passedCount(trials: EvalTrial[]): number {
  return trials.filter((trial) => trial.verdict.kind === "pass").length;
}

export function eligibleCount(trials: EvalTrial[]): number {
  return trials.filter((trial) => trial.verdict.kind !== "not-eligible").length;
}

export function finishedCount(trials: EvalTrial[]): number {
  return trials.filter((trial) => trial.verdict.kind === "pass" || trial.verdict.kind === "fail").length;
}

function missingFinished(trials: EvalTrial[]): string | null {
  if (finishedCount(trials) > 0) {
    return null;
  }
  return eligibleCount(trials) === 0 ? "no eligible trials" : "no finished trials";
}

function runningCount(trials: EvalTrial[]): number {
  return trials.filter((trial) => trial.verdict.kind === "running").length;
}

export function caseChange(evalCase: EvalCase): CaseChange {
  const running = runningCount(evalCase.baseline) + runningCount(evalCase.candidate);
  if (running > 0) {
    return { kind: "running", count: running };
  }
  const baselineGap = missingFinished(evalCase.baseline);
  const candidateGap = missingFinished(evalCase.candidate);
  if (baselineGap !== null) {
    return { kind: "not-comparable", reason: `Baseline has ${baselineGap}` };
  }
  if (candidateGap !== null) {
    return { kind: "not-comparable", reason: `Candidate has ${candidateGap}` };
  }
  const diff = passedCount(evalCase.candidate) - passedCount(evalCase.baseline);
  if (diff === 0) {
    return { kind: "same" };
  }
  return diff < 0 ? { kind: "fewer", by: -diff } : { kind: "more", by: diff };
}

export function changeWords(change: CaseChange): string {
  switch (change.kind) {
    case "fewer":
      return `${change.by} fewer passed`;
    case "more":
      return `${change.by} more passed`;
    case "same":
      return "same";
    case "running":
      return `${change.count} still running`;
    case "not-comparable":
      return "not comparable";
    default:
      return assertNever(change);
  }
}

export function regressions(experiment: EvalExperiment): EvalCase[] {
  return experiment.cases.filter((evalCase) => caseChange(evalCase).kind === "fewer");
}

export function verdictWords(verdict: EvalVerdict): string {
  switch (verdict.kind) {
    case "pass":
      return "passed";
    case "fail":
      return "failed";
    case "unknown":
      return "unknown";
    case "not-eligible":
      return "not eligible";
    case "running":
      return "running";
    default:
      return assertNever(verdict);
  }
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function formatMeasureValue(value: MeasureValue): string {
  switch (value.unit) {
    case "trials":
      return `${value.passed} of ${plural(value.total, "trial", "trials")}`;
    case "seconds":
      return duration(Math.round(value.median));
    case "calls":
      return plural(value.median, "call", "calls");
    default:
      return assertNever(value);
  }
}

const MINUS = "\u2212";

function signed(amount: number, unit: MeasureUnit): string {
  const magnitude = unit === "seconds" ? duration(Math.round(Math.abs(amount))) : String(Math.abs(amount));
  if (amount > 0) {
    return `+${magnitude}`;
  }
  return amount < 0 ? `${MINUS}${magnitude}` : magnitude;
}

export function formatInterval(change: MeasureChange, unit: MeasureUnit): string {
  return `interval ${signed(change.low, unit)} to ${signed(change.high, unit)}`;
}

export function measureChangeWords(change: MeasureChange, unit: MeasureUnit): string {
  if (change.delta === 0) {
    return "same";
  }
  const size = Math.abs(change.delta);
  const more = change.delta > 0;
  switch (unit) {
    case "trials":
      return `${size} ${more ? "more" : "fewer"} ${size === 1 ? "trial" : "trials"} passed`;
    case "seconds":
      return `${duration(Math.round(size))} ${more ? "slower" : "faster"}`;
    case "calls":
      return `${size} ${more ? "more" : "fewer"} ${size === 1 ? "call" : "calls"}`;
    default:
      return assertNever(unit);
  }
}

export function formatChange(change: MeasureChange, unit: MeasureUnit): string {
  return `${measureChangeWords(change, unit)} · ${formatInterval(change, unit)}`;
}

function candidateFocus(evalCase: EvalCase, trial: EvalTrial | undefined): EvalFocus | null {
  return trial === undefined ? null : { caseId: evalCase.id, side: "candidate", attempt: trial.attempt };
}

export function caseFocus(evalCase: EvalCase): EvalFocus | null {
  const failed = evalCase.candidate.find((trial) => trial.verdict.kind === "fail");
  return candidateFocus(evalCase, failed ?? evalCase.candidate[0]);
}

export function nextRegression(experiment: EvalExperiment, fromCaseId: string | null): EvalCase | null {
  const found = regressions(experiment);
  const from = experiment.cases.findIndex((evalCase) => evalCase.id === fromCaseId);
  const after = found.find((evalCase) => experiment.cases.indexOf(evalCase) > from);
  return after ?? found[0] ?? null;
}

export function firstFocus(experiment: EvalExperiment): EvalFocus | null {
  for (const evalCase of regressions(experiment)) {
    const failed = evalCase.candidate.find((trial) => trial.verdict.kind === "fail");
    const focus = candidateFocus(evalCase, failed);
    if (focus !== null) {
      return focus;
    }
  }
  const firstCase = experiment.cases[0];
  return firstCase === undefined ? null : candidateFocus(firstCase, firstCase.candidate[0]);
}

export function verdictReason(verdict: EvalVerdict): string | null {
  switch (verdict.kind) {
    case "fail":
    case "unknown":
    case "not-eligible":
      return verdict.reason;
    case "pass":
    case "running":
      return null;
    default:
      return assertNever(verdict);
  }
}

export function graderMethodWords(method: GraderMethod): string {
  switch (method) {
    case "executable":
      return "executable grader";
    case "human-rubric":
      return "human rubric grader";
    case "model-judge":
      return "model judge grader";
    default:
      return assertNever(method);
  }
}

export type ChangeGroupKind = "fewer" | "more" | "not-comparable" | "running";

export type ChangeGroup = { kind: ChangeGroupKind; title: string; cases: EvalCase[] };

export type ChangeGroups = { groups: ChangeGroup[]; unchanged: EvalCase[] };

export type ValidityItem = { term: string; lines: string[] };

const GROUP_ORDER: ChangeGroupKind[] = ["fewer", "more", "not-comparable", "running"];

const GROUP_TITLES: Record<ChangeGroupKind, string> = {
  fewer: "Fewer passed",
  more: "More passed",
  "not-comparable": "Not comparable",
  running: "Still running",
};

export function changeGroups(experiment: EvalExperiment): ChangeGroups {
  const buckets: Record<ChangeGroupKind, EvalCase[]> = { fewer: [], more: [], "not-comparable": [], running: [] };
  const unchanged: EvalCase[] = [];
  for (const evalCase of experiment.cases) {
    const change = caseChange(evalCase);
    switch (change.kind) {
      case "fewer":
      case "more":
      case "not-comparable":
      case "running":
        buckets[change.kind].push(evalCase);
        break;
      case "same":
        unchanged.push(evalCase);
        break;
      default:
        assertNever(change);
    }
  }
  const groups = GROUP_ORDER.filter((kind) => buckets[kind].length > 0).map((kind) => ({
    kind,
    title: GROUP_TITLES[kind],
    cases: buckets[kind],
  }));
  return { groups, unchanged };
}

export function caseCountWords(count: number): string {
  return plural(count, "case", "cases");
}

function sideWord(side: EvalSide): string {
  return side === "baseline" ? "Baseline" : "Candidate";
}

function stripPeriod(text: string): string {
  return text.endsWith(".") ? text.slice(0, -1) : text;
}

export function lowerFirst(text: string): string {
  const first = text.charAt(0);
  const second = text.charAt(1);
  return first !== first.toLowerCase() && second === second.toLowerCase() ? first.toLowerCase() + text.slice(1) : text;
}

function trialList(attempts: number[]): string {
  return attempts.length === 1 ? `trial ${attempts[0]}` : `trials ${listAnd(attempts.map(String))}`;
}

function failedSentence(side: EvalSide, trials: EvalTrial[]): string | null {
  const byReason: { reason: string; attempts: number[] }[] = [];
  for (const trial of trials) {
    if (trial.verdict.kind === "fail") {
      const reason = stripPeriod(trial.verdict.reason);
      const group = byReason.find((item) => item.reason === reason);
      if (group === undefined) {
        byReason.push({ reason, attempts: [trial.attempt] });
      } else {
        group.attempts.push(trial.attempt);
      }
    }
  }
  if (byReason.length === 0) {
    return null;
  }
  const clauses = byReason.map(
    (group, index) =>
      `${index === 0 ? `${sideWord(side)} ` : ""}${trialList(group.attempts)} failed: ${lowerFirst(group.reason)}`,
  );
  return `${clauses.join("; ")}.`;
}

function regradeSentences(evalCase: EvalCase): string[] {
  const sides: EvalSide[] = ["baseline", "candidate"];
  return sides.flatMap((side) =>
    evalCase[side].flatMap((trial) => {
      const first = trial.regrades[0];
      const last = trial.regrades[trial.regrades.length - 1];
      if (first === undefined || last === undefined || first === last) {
        return [];
      }
      return [`${sideWord(side)} trial ${trial.attempt} regraded ${first.version} ${first.verdict} \u2192 ${last.version} ${last.verdict}.`];
    }),
  );
}

function firstNotEligibleReason(evalCase: EvalCase): string | null {
  for (const trial of [...evalCase.candidate, ...evalCase.baseline]) {
    if (trial.verdict.kind === "not-eligible") {
      return trial.verdict.reason;
    }
  }
  return null;
}

export function entryReason(evalCase: EvalCase): string | null {
  const change = caseChange(evalCase);
  let failed: string | null = null;
  switch (change.kind) {
    case "fewer":
      failed = failedSentence("candidate", evalCase.candidate);
      break;
    case "more":
      failed = failedSentence("baseline", evalCase.baseline);
      break;
    case "not-comparable":
      return firstNotEligibleReason(evalCase) ?? change.reason;
    case "same":
    case "running":
      break;
    default:
      return assertNever(change);
  }
  const parts = [...(failed === null ? [] : [failed]), ...regradeSentences(evalCase)];
  return parts.length === 0 ? null : parts.join(" ");
}

function focusOn(evalCase: EvalCase, side: EvalSide, trial: EvalTrial | undefined): EvalFocus | null {
  return trial === undefined ? null : { caseId: evalCase.id, side, attempt: trial.attempt };
}

export function defaultTrial(evalCase: EvalCase): EvalFocus | null {
  const change = caseChange(evalCase);
  const failedOn = (side: EvalSide) => evalCase[side].find((trial) => trial.verdict.kind === "fail");
  switch (change.kind) {
    case "fewer":
      return focusOn(evalCase, "candidate", failedOn("candidate") ?? evalCase.candidate[0]);
    case "more": {
      const baselineFail = failedOn("baseline");
      return baselineFail === undefined
        ? focusOn(evalCase, "candidate", evalCase.candidate[0])
        : focusOn(evalCase, "baseline", baselineFail);
    }
    case "not-comparable": {
      const candidate = evalCase.candidate.find((trial) => trial.verdict.kind === "not-eligible");
      if (candidate !== undefined) {
        return focusOn(evalCase, "candidate", candidate);
      }
      const baseline = evalCase.baseline.find((trial) => trial.verdict.kind === "not-eligible");
      return baseline === undefined
        ? focusOn(evalCase, "candidate", evalCase.candidate[0])
        : focusOn(evalCase, "baseline", baseline);
    }
    case "same":
    case "running":
      return focusOn(evalCase, "candidate", evalCase.candidate[0]);
    default:
      return assertNever(change);
  }
}

export function unknownCount(evalCase: EvalCase): number {
  return [...evalCase.baseline, ...evalCase.candidate].filter((trial) => trial.verdict.kind === "unknown").length;
}

function sideTrials(experiment: EvalExperiment, side: EvalSide): EvalTrial[] {
  return experiment.cases.flatMap((evalCase) => evalCase[side]);
}

function sideLines(experiment: EvalExperiment, kind: "not-eligible" | "unknown" | "running"): string[] {
  const sides: EvalSide[] = ["baseline", "candidate"];
  return sides.flatMap((side) => {
    const byReason: { reason: string | null; count: number }[] = [];
    for (const trial of sideTrials(experiment, side)) {
      if (trial.verdict.kind === kind) {
        const reason = verdictReason(trial.verdict);
        const group = byReason.find((item) => item.reason === reason);
        if (group === undefined) {
          byReason.push({ reason, count: 1 });
        } else {
          group.count += 1;
        }
      }
    }
    return byReason.map(({ reason, count }) => {
      const subject = `${count} ${side} ${count === 1 ? "trial" : "trials"}`;
      return reason === null ? `${subject} still running` : `${subject} \u00b7 ${reason}`;
    });
  });
}

function trialsWord(count: number): string {
  return plural(count, "trial", "trials");
}

function casesSentence(experiment: EvalExperiment): string {
  const total = experiment.cases.length;
  if (total === 0) {
    return "No cases in this experiment yet";
  }
  const shared = experiment.cases.filter((evalCase) => evalCase.baseline.length > 0 && evalCase.candidate.length > 0).length;
  return shared === total
    ? `Same ${caseCountWords(total)} on both sides`
    : `${shared} of ${caseCountWords(total)} have trials on both sides`;
}

function graderSentence(experiment: EvalExperiment): string {
  const version = experiment.graderVersion;
  const checks = experiment.cases.flatMap((evalCase) =>
    [...evalCase.baseline, ...evalCase.candidate].flatMap((trial) => trial.checks),
  );
  const matching = checks.filter((check) => check.version === version).length;
  const bothSides = sideTrials(experiment, "baseline").length > 0 && sideTrials(experiment, "candidate").length > 0;
  const base =
    checks.length === 0
      ? version
      : matching === checks.length
        ? `${version} on ${bothSides ? "both arms" : "every check"}`
        : `${version} on ${matching} of ${plural(checks.length, "check", "checks")}`;
  const regraded = experiment.cases.reduce(
    (sum, evalCase) => sum + [...evalCase.baseline, ...evalCase.candidate].filter((trial) => trial.regrades.length > 0).length,
    0,
  );
  return regraded === 0 ? `${base}, no regrades` : `${base}, ${trialsWord(regraded)} regraded`;
}

export function validitySummary(experiment: EvalExperiment): ValidityItem[] {
  const excluded = sideLines(experiment, "not-eligible");
  const unknown = sideLines(experiment, "unknown");
  const running = sideLines(experiment, "running");
  const items: ValidityItem[] = [
    { term: "Cases", lines: [casesSentence(experiment)] },
    { term: "Grader", lines: [graderSentence(experiment)] },
    { term: "Excluded", lines: excluded.length === 0 ? ["No trials excluded or ineligible"] : excluded },
    { term: "Unlabeled", lines: unknown.length === 0 ? ["No unknown trials"] : unknown },
  ];
  return running.length === 0 ? items : [...items, { term: "Running", lines: running }];
}

export function formatMeasurePair(baseline: MeasureValue, candidate: MeasureValue): string {
  if (baseline.unit === "trials" && candidate.unit === "trials") {
    return `${baseline.passed} of ${baseline.total} \u2192 ${candidate.passed} of ${plural(candidate.total, "trial", "trials")}`;
  }
  if (baseline.unit === "seconds" && candidate.unit === "seconds") {
    return `${duration(Math.round(baseline.median))} \u2192 ${duration(Math.round(candidate.median))}`;
  }
  if (baseline.unit === "calls" && candidate.unit === "calls") {
    return `${baseline.median} \u2192 ${plural(candidate.median, "call", "calls")}`;
  }
  return `${formatMeasureValue(baseline)} \u2192 ${formatMeasureValue(candidate)}`;
}
