import { describe, expect, it } from "vitest";
import type { EvalCase, EvalTrial, EvalVerdict } from "@/model";
import { createEvalDemo, createLiveEvalDemo } from "@/demo/evals";
import {
  caseChange,
  caseCountWords,
  caseFocus,
  changeGroups,
  defaultTrial,
  entryReason,
  formatMeasurePair,
  lowerFirst,
  validitySummary,
  changeWords,
  eligibleCount,
  finishedCount,
  firstFocus,
  formatChange,
  formatInterval,
  formatMeasureValue,
  graderMethodWords,
  nextRegression,
  passedCount,
  regressions,
  verdictReason,
  verdictWords,
} from "./evals";

function trials(...kinds: EvalVerdict["kind"][]): EvalTrial[] {
  return kinds.map((kind, index) => {
    const attempt = index + 1;
    const base = { attempt, checks: [], regrades: [], missing: [] };
    switch (kind) {
      case "pass":
      case "running":
        return { ...base, verdict: { kind } };
      case "fail":
      case "unknown":
      case "not-eligible":
        return { ...base, verdict: { kind, reason: "because" } };
    }
  });
}

function caseOf(baseline: EvalTrial[], candidate: EvalTrial[]): EvalCase {
  return {
    id: "c",
    title: "Case",
    revision: "v1",
    capability: "Family",
    graderMethod: "executable",
    requirement: { text: "x", source: "s" },
    baseline,
    candidate,
  };
}

describe("trial counts", () => {
  const mixed = trials("pass", "fail", "unknown", "not-eligible", "running");

  it("counts passed trials only", () => {
    expect(passedCount(mixed)).toBe(1);
  });

  it("counts every trial that is not setup ineligible as eligible", () => {
    expect(eligibleCount(mixed)).toBe(4);
  });

  it("counts only passed and failed trials as finished", () => {
    expect(finishedCount(mixed)).toBe(2);
  });
});

describe("caseChange", () => {
  it("reports fewer passed on the candidate", () => {
    expect(caseChange(caseOf(trials("pass", "pass", "pass"), trials("pass", "fail", "pass")))).toEqual({
      kind: "fewer",
      by: 1,
    });
  });

  it("reports more passed on the candidate", () => {
    expect(caseChange(caseOf(trials("pass", "fail", "fail"), trials("pass", "pass", "pass")))).toEqual({
      kind: "more",
      by: 2,
    });
  });

  it("reports same when counts match even if different attempts passed", () => {
    expect(caseChange(caseOf(trials("pass", "fail", "pass"), trials("fail", "pass", "pass")))).toEqual({ kind: "same" });
  });

  it("is not comparable when a side has only not-eligible trials", () => {
    expect(caseChange(caseOf(trials("pass", "pass", "fail"), trials("not-eligible", "not-eligible", "not-eligible")))).toEqual({
      kind: "not-comparable",
      reason: "Candidate has no eligible trials",
    });
    expect(caseChange(caseOf(trials("not-eligible", "not-eligible", "not-eligible"), trials("pass", "pass", "pass")))).toEqual({
      kind: "not-comparable",
      reason: "Baseline has no eligible trials",
    });
  });

  it("reads running when any trial is still running, never a regression", () => {
    expect(caseChange(caseOf(trials("pass", "fail", "pass"), trials("running", "running", "running")))).toEqual({
      kind: "running",
      count: 3,
    });
    expect(caseChange(caseOf(trials("pass", "pass", "pass"), trials("fail", "fail", "running")))).toEqual({
      kind: "running",
      count: 1,
    });
    expect(caseChange(caseOf(trials("running", "pass", "pass"), trials("not-eligible", "not-eligible", "running")))).toEqual({
      kind: "running",
      count: 2,
    });
  });

  it("does not count a side with only unknown trials as finished", () => {
    expect(caseChange(caseOf(trials("pass", "pass", "pass"), trials("unknown", "unknown", "unknown"))).kind).toBe(
      "not-comparable",
    );
  });

  it("ignores not-eligible trials when comparing the rest", () => {
    expect(caseChange(caseOf(trials("not-eligible", "pass", "pass"), trials("pass", "pass", "fail")))).toEqual({
      kind: "same",
    });
  });
});

describe("changeWords", () => {
  it("words each change", () => {
    expect(changeWords({ kind: "fewer", by: 1 })).toBe("1 fewer passed");
    expect(changeWords({ kind: "more", by: 3 })).toBe("3 more passed");
    expect(changeWords({ kind: "same" })).toBe("same");
    expect(changeWords({ kind: "running", count: 3 })).toBe("3 still running");
    expect(changeWords({ kind: "running", count: 1 })).toBe("1 still running");
    expect(changeWords({ kind: "not-comparable", reason: "x" })).toBe("not comparable");
  });
});

describe("regressions", () => {
  it("names only the latest-instruction case in the complete fixture", () => {
    expect(regressions(createEvalDemo()).map((evalCase) => evalCase.title)).toEqual(["Use the latest instruction"]);
  });

  it("keeps suite order", () => {
    const experiment = createEvalDemo();
    const first = experiment.cases.find((evalCase) => evalCase.id === "repo-guidance");
    const second = experiment.cases.find((evalCase) => evalCase.id === "missing-evidence");
    if (first === undefined || second === undefined) {
      throw new Error("fixture cases missing");
    }
    const worse = (evalCase: EvalCase): EvalCase => ({ ...evalCase, candidate: trials("fail", "fail", "fail") });
    const changed = {
      ...experiment,
      cases: experiment.cases.map((evalCase) => (evalCase === first || evalCase === second ? worse(evalCase) : evalCase)),
    };
    expect(regressions(changed).map((evalCase) => evalCase.id)).toEqual([
      first.id,
      "latest-instruction",
      second.id,
    ]);
  });

  it("finds nothing when no case has fewer passed", () => {
    const experiment = createEvalDemo();
    expect(regressions({ ...experiment, cases: experiment.cases.filter((evalCase) => evalCase.id !== "latest-instruction") })).toEqual([]);
  });
});

describe("formatMeasureValue", () => {
  it("formats trials, seconds and calls", () => {
    expect(formatMeasureValue({ unit: "trials", passed: 16, total: 24 })).toBe("16 of 24 trials");
    expect(formatMeasureValue({ unit: "seconds", median: 124 })).toBe("2m 04s");
    expect(formatMeasureValue({ unit: "seconds", median: 45 })).toBe("45s");
    expect(formatMeasureValue({ unit: "calls", median: 11 })).toBe("11 calls");
  });

  it("uses the singular for one", () => {
    expect(formatMeasureValue({ unit: "trials", passed: 0, total: 1 })).toBe("0 of 1 trial");
    expect(formatMeasureValue({ unit: "calls", median: 1 })).toBe("1 call");
  });
});

describe("formatChange", () => {
  const method = "paired bootstrap, 95%";

  it("words a trials change with a mixed-sign interval", () => {
    expect(formatChange({ delta: 3, low: -1, high: 6, method }, "trials")).toBe("3 more trials passed · interval −1 to +6");
  });

  it("words a negative trials change with a negative interval", () => {
    expect(formatChange({ delta: -2, low: -5, high: -1, method }, "trials")).toBe("2 fewer trials passed · interval −5 to −1");
    expect(formatChange({ delta: -1, low: -2, high: 0, method }, "trials")).toBe("1 fewer trial passed · interval −2 to 0");
  });

  it("uses the true minus sign and never a hyphen in a negative interval", () => {
    const text = formatChange({ delta: -2, low: -5, high: -1, method }, "trials");
    expect(text.includes("\u2212")).toBe(true);
    expect(text.includes("-")).toBe(false);
  });

  it("words a seconds change as faster or slower", () => {
    expect(formatChange({ delta: -26, low: -41, high: 8, method }, "seconds")).toBe("26s faster · interval −41s to +8s");
    expect(formatChange({ delta: 70, low: 62, high: 80, method }, "seconds")).toBe("1m 10s slower · interval +1m 02s to +1m 20s");
  });

  it("words a calls change", () => {
    expect(formatChange({ delta: -2, low: -5, high: 1, method }, "calls")).toBe("2 fewer calls · interval −5 to +1");
    expect(formatChange({ delta: 1, low: 0, high: 2, method }, "calls")).toBe("1 more call · interval 0 to +2");
  });

  it("says same for a zero change", () => {
    expect(formatChange({ delta: 0, low: -1, high: 1, method }, "trials")).toBe("same · interval −1 to +1");
  });

  it("formats the interval alone", () => {
    expect(formatInterval({ delta: 0, low: -1, high: 4, method }, "trials")).toBe("interval −1 to +4");
  });
});

describe("verdictWords", () => {
  it("covers every verdict variant", () => {
    const verdicts: [EvalVerdict, string][] = [
      [{ kind: "pass" }, "passed"],
      [{ kind: "fail", reason: "r" }, "failed"],
      [{ kind: "unknown", reason: "r" }, "unknown"],
      [{ kind: "not-eligible", reason: "r" }, "not eligible"],
      [{ kind: "running" }, "running"],
    ];
    for (const [verdict, words] of verdicts) {
      expect(verdictWords(verdict)).toBe(words);
    }
  });
});

describe("firstFocus", () => {
  it("points at the first failing candidate trial of the first regression", () => {
    expect(firstFocus(createEvalDemo())).toEqual({ caseId: "latest-instruction", side: "candidate", attempt: 2 });
  });

  it("falls back to the first case's first candidate trial without a regression", () => {
    const experiment = createEvalDemo();
    const none = { ...experiment, cases: experiment.cases.filter((evalCase) => evalCase.id !== "latest-instruction") };
    expect(firstFocus(none)).toEqual({ caseId: "api-change", side: "candidate", attempt: 1 });
  });

  it("returns null for an experiment without cases", () => {
    expect(firstFocus({ ...createEvalDemo(), cases: [] })).toBeNull();
  });

  it("excludes still-running cases from the live regressions", () => {
    const live = createLiveEvalDemo();
    const budget = live.cases.find((evalCase) => evalCase.id === "tool-budget");
    expect(budget && changeWords(caseChange(budget))).toBe("3 still running");
    const evidence = live.cases.find((evalCase) => evalCase.id === "missing-evidence");
    expect(evidence && changeWords(caseChange(evidence))).toBe("1 still running");
    expect(regressions(live).map((evalCase) => evalCase.id)).toEqual(["latest-instruction"]);
  });
});

describe("verdictReason", () => {
  it("returns the reason for fail, unknown and not-eligible only", () => {
    expect(verdictReason({ kind: "fail", reason: "a" })).toBe("a");
    expect(verdictReason({ kind: "unknown", reason: "b" })).toBe("b");
    expect(verdictReason({ kind: "not-eligible", reason: "c" })).toBe("c");
    expect(verdictReason({ kind: "pass" })).toBeNull();
    expect(verdictReason({ kind: "running" })).toBeNull();
  });
});

describe("graderMethodWords", () => {
  it("names every grader method", () => {
    expect(graderMethodWords("executable")).toBe("executable grader");
    expect(graderMethodWords("human-rubric")).toBe("human rubric grader");
    expect(graderMethodWords("model-judge")).toBe("model judge grader");
  });
});

describe("caseFocus", () => {
  it("prefers the first failing candidate trial and falls back to the first trial", () => {
    const experiment = createEvalDemo();
    const find = (id: string) => {
      const found = experiment.cases.find((evalCase) => evalCase.id === id);
      if (found === undefined) {
        throw new Error(id);
      }
      return found;
    };
    expect(caseFocus(find("latest-instruction"))).toEqual({ caseId: "latest-instruction", side: "candidate", attempt: 2 });
    expect(caseFocus(find("api-change"))).toEqual({ caseId: "api-change", side: "candidate", attempt: 1 });
    expect(caseFocus({ ...find("api-change"), candidate: [] })).toBeNull();
  });
});

describe("nextRegression", () => {
  function withRegressions(ids: string[]) {
    const experiment = createEvalDemo();
    return {
      ...experiment,
      cases: experiment.cases.map((evalCase) =>
        ids.includes(evalCase.id) ? { ...evalCase, candidate: trials("fail", "fail", "fail"), baseline: trials("pass", "pass", "pass") } : evalCase,
      ),
    };
  }

  it("returns the next regression after the current case in suite order", () => {
    const experiment = withRegressions(["repo-guidance", "missing-evidence"]);
    expect(nextRegression(experiment, "repo-guidance")?.id).toBe("latest-instruction");
    expect(nextRegression(experiment, "latest-instruction")?.id).toBe("missing-evidence");
  });

  it("wraps to the first regression and starts there without a current case", () => {
    const experiment = withRegressions(["repo-guidance", "missing-evidence"]);
    expect(nextRegression(experiment, "missing-evidence")?.id).toBe("repo-guidance");
    expect(nextRegression(experiment, null)?.id).toBe("repo-guidance");
  });

  it("returns null when there is no regression", () => {
    const experiment = createEvalDemo();
    const none = { ...experiment, cases: experiment.cases.filter((evalCase) => evalCase.id !== "latest-instruction") };
    expect(nextRegression(none, null)).toBeNull();
  });
});

function caseById(experiment: ReturnType<typeof createEvalDemo>, id: string): EvalCase {
  const found = experiment.cases.find((evalCase) => evalCase.id === id);
  if (found === undefined) {
    throw new Error(id);
  }
  return found;
}

describe("changeGroups", () => {
  it("orders the groups and keeps suite order inside them for the complete fixture", () => {
    const { groups, unchanged } = changeGroups(createEvalDemo());
    expect(groups.map((group) => [group.kind, group.title, group.cases.map((evalCase) => evalCase.id)])).toEqual([
      ["fewer", "Fewer passed", ["latest-instruction"]],
      ["more", "More passed", ["handoff-constraints", "missing-evidence"]],
      ["not-comparable", "Not comparable", ["compaction-requirements"]],
    ]);
    expect(unchanged.map((evalCase) => evalCase.id)).toEqual(["api-change", "repo-guidance", "source-evidence", "tool-budget"]);
  });

  it("adds a still running group for the live fixture and omits empty groups", () => {
    const { groups, unchanged } = changeGroups(createLiveEvalDemo());
    expect(groups.map((group) => [group.title, group.cases.map((evalCase) => evalCase.id)])).toEqual([
      ["Fewer passed", ["latest-instruction"]],
      ["More passed", ["handoff-constraints"]],
      ["Not comparable", ["compaction-requirements"]],
      ["Still running", ["missing-evidence", "tool-budget"]],
    ]);
    expect(unchanged.map((evalCase) => evalCase.id)).toEqual(["api-change", "repo-guidance", "source-evidence"]);
    expect(changeGroups({ ...createEvalDemo(), cases: [] })).toEqual({ groups: [], unchanged: [] });
  });

  it("counts cases in words", () => {
    expect(caseCountWords(1)).toBe("1 case");
    expect(caseCountWords(2)).toBe("2 cases");
  });
});

describe("lowerFirst", () => {
  it("lowers a leading capital only when the next letter is lower case", () => {
    expect(lowerFirst("Delivered limit")).toBe("delivered limit");
    expect(lowerFirst("API limit")).toBe("API limit");
    expect(lowerFirst("19 tool calls")).toBe("19 tool calls");
  });
});

describe("entryReason", () => {
  const experiment = createEvalDemo();

  it("names the failing candidate trial of a regression", () => {
    expect(entryReason(caseById(experiment, "latest-instruction"))).toBe(
      "Candidate trial 2 failed: delivered limit is 60 requests per minute; the requirement is 100.",
    );
  });

  it("names the failing baseline trials of an improvement", () => {
    expect(entryReason(caseById(experiment, "handoff-constraints"))).toBe(
      "Baseline trials 2 and 3 failed: constraint missing from the handoff; the diff touches src/shared/money.ts.",
    );
  });

  it("adds a regrade note from the recorded history", () => {
    expect(entryReason(caseById(experiment, "missing-evidence"))).toBe(
      "Baseline trial 2 failed: names a cause the log does not support. Candidate trial 1 regraded g2 failed \u2192 g3 passed.",
    );
  });

  it("gives the not-eligible reason verbatim for a case that is not comparable", () => {
    expect(entryReason(caseById(experiment, "compaction-requirements"))).toBe(
      "Setup ineligible: the candidate host did not compact in this run",
    );
  });

  it("has no reason for an unchanged or running case without a regrade", () => {
    expect(entryReason(caseById(experiment, "api-change"))).toBeNull();
    expect(entryReason(caseById(createLiveEvalDemo(), "tool-budget"))).toBeNull();
  });

  it("groups failing trials by reason", () => {
    const base = caseById(experiment, "latest-instruction");
    const failing = (attempt: number, reason: string): EvalTrial => ({
      attempt,
      verdict: { kind: "fail", reason },
      checks: [],
      regrades: [],
      missing: [],
    });
    const changed: EvalCase = {
      ...base,
      baseline: trials("pass", "pass", "pass"),
      candidate: [failing(1, "Too slow."), failing(2, "Wrong value."), failing(3, "Too slow.")],
    };
    expect(entryReason(changed)).toBe("Candidate trials 1 and 3 failed: too slow; trial 2 failed: wrong value.");
  });
});

describe("defaultTrial", () => {
  const experiment = createEvalDemo();

  it("opens the first failing candidate trial of a regression", () => {
    expect(defaultTrial(caseById(experiment, "latest-instruction"))).toEqual({
      caseId: "latest-instruction",
      side: "candidate",
      attempt: 2,
    });
  });

  it("opens the first failing baseline trial of an improvement", () => {
    expect(defaultTrial(caseById(experiment, "handoff-constraints"))).toEqual({
      caseId: "handoff-constraints",
      side: "baseline",
      attempt: 2,
    });
  });

  it("opens the first not-eligible trial of a case that is not comparable", () => {
    expect(defaultTrial(caseById(experiment, "compaction-requirements"))).toEqual({
      caseId: "compaction-requirements",
      side: "candidate",
      attempt: 1,
    });
    const baselineOnly: EvalCase = {
      ...caseById(experiment, "tool-budget"),
      baseline: trials("not-eligible", "not-eligible", "not-eligible"),
    };
    expect(defaultTrial(baselineOnly)).toEqual({ caseId: "tool-budget", side: "baseline", attempt: 1 });
  });

  it("opens the first candidate trial of an unchanged or running case", () => {
    expect(defaultTrial(caseById(experiment, "api-change"))).toEqual({ caseId: "api-change", side: "candidate", attempt: 1 });
    expect(defaultTrial(caseById(createLiveEvalDemo(), "tool-budget"))).toEqual({
      caseId: "tool-budget",
      side: "candidate",
      attempt: 1,
    });
  });

  it("returns null for a case without trials", () => {
    expect(defaultTrial({ ...caseById(experiment, "api-change"), baseline: [], candidate: [] })).toBeNull();
  });
});

describe("validitySummary", () => {
  it("derives one line per fact from the complete fixture, reasons as given", () => {
    expect(validitySummary(createEvalDemo())).toEqual([
      { term: "Cases", lines: ["Same 8 cases on both sides"] },
      { term: "Grader", lines: ["g3 on both arms, 1 trial regraded"] },
      {
        term: "Excluded",
        lines: [
          "1 baseline trial \u00b7 Excluded: provider outage during the trial, declared before analysis",
          "3 candidate trials \u00b7 Setup ineligible: the candidate host did not compact in this run",
        ],
      },
      { term: "Unlabeled", lines: ["1 candidate trial \u00b7 Awaiting human label"] },
    ]);
  });

  it("adds a running line for the live fixture", () => {
    const items = validitySummary(createLiveEvalDemo());
    expect(items[items.length - 1]).toEqual({ term: "Running", lines: ["4 candidate trials still running"] });
    expect(items.map((item) => item.term)).toEqual(["Cases", "Grader", "Excluded", "Unlabeled", "Running"]);
  });

  it("groups trials of one side by identical reason", () => {
    const experiment = createEvalDemo();
    const first = experiment.cases[0];
    if (first === undefined) {
      throw new Error("fixture has no cases");
    }
    const edited = {
      ...experiment,
      cases: [{ ...first, candidate: trials("not-eligible", "not-eligible", "unknown") }, ...experiment.cases.slice(1)],
    };
    const lines = Object.fromEntries(validitySummary(edited).map((item) => [item.term, item.lines]));
    expect(lines["Excluded"]).toEqual([
      "1 baseline trial \u00b7 Excluded: provider outage during the trial, declared before analysis",
      "2 candidate trials \u00b7 because",
      "3 candidate trials \u00b7 Setup ineligible: the candidate host did not compact in this run",
    ]);
    expect(lines["Unlabeled"]).toEqual(["1 candidate trial \u00b7 because", "1 candidate trial \u00b7 Awaiting human label"]);
  });

  it("does not claim what the data cannot show", () => {
    const experiment = createEvalDemo();
    const edited = {
      ...experiment,
      graderVersion: "g4",
      cases: experiment.cases.map((evalCase, index) => (index === 0 ? { ...evalCase, candidate: [] } : evalCase)),
    };
    const items = Object.fromEntries(validitySummary(edited).map((item) => [item.term, item.lines]));
    expect(items["Cases"]).toEqual(["7 of 8 cases have trials on both sides"]);
    expect(items["Grader"]).toEqual(["g4 on 0 of 45 checks, 1 trial regraded"]);
    const clean = validitySummary({ ...experiment, cases: [] });
    expect(clean.map((item) => item.lines)).toEqual([
      ["No cases in this experiment yet"],
      ["g3, no regrades"],
      ["No trials excluded or ineligible"],
      ["No unknown trials"],
    ]);
  });
});

describe("formatMeasurePair", () => {
  it("shows both values with an arrow in each unit", () => {
    expect(formatMeasurePair({ unit: "trials", passed: 15, total: 20 }, { unit: "trials", passed: 17, total: 20 })).toBe(
      "15 of 20 \u2192 17 of 20 trials",
    );
    expect(formatMeasurePair({ unit: "seconds", median: 124 }, { unit: "seconds", median: 98 })).toBe("2m 04s \u2192 1m 38s");
    expect(formatMeasurePair({ unit: "calls", median: 13 }, { unit: "calls", median: 11 })).toBe("13 \u2192 11 calls");
    expect(formatMeasurePair({ unit: "calls", median: 3 }, { unit: "calls", median: 1 })).toBe("3 \u2192 1 call");
  });
});
