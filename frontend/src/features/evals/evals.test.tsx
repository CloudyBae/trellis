import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { EvalExperiment } from "@/model";
import { createEvalDemo, createLiveEvalDemo } from "@/demo/evals";
import { changeGroups } from "@/lib/evals";
import type { EvalFocus } from "@/lib/evals";
import { topLevelBlocks } from "@/styles/cssText";
import { ExperimentLine } from "./ExperimentLine";
import { KeyLine } from "./KeyLine";
import { Ledger } from "./Ledger";
import { MeasuresList } from "./MeasuresList";
import { ValidityPanel } from "./ValidityPanel";

afterEach(cleanup);

function ledgerOf(experiment: EvalExperiment, focus: EvalFocus | null = null, expanded = false) {
  render(
    <Ledger
      experiment={experiment}
      groups={changeGroups(experiment)}
      focus={focus}
      expanded={expanded}
      onToggleFold={() => undefined}
      onOpen={() => undefined}
      onClose={() => undefined}
      onSelectTrial={() => undefined}
    />,
  );
}

function entry(caseId: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>(".eval-entry")].find((item) => item.dataset.caseId === caseId);
  if (found === undefined) {
    throw new Error(`No entry ${caseId}`);
  }
  return found;
}

function nameOf(item: Element): string | null | undefined {
  return item.querySelector(".eval-name")?.childNodes[0]?.textContent;
}

function headings(): string[] {
  return [...document.querySelectorAll(".eval-group > h2")].map(
    (heading) => `${heading.querySelector(".title")?.textContent}|${heading.querySelector(".count")?.textContent}`,
  );
}

const LATEST: EvalFocus = { caseId: "latest-instruction", side: "candidate", attempt: 2 };

describe("Ledger groups", () => {
  it("orders the groups with their counts for the complete fixture", () => {
    ledgerOf(createEvalDemo());
    expect(headings()).toEqual(["Fewer passed|1 case", "More passed|2 cases", "Not comparable|1 case"]);
    const groups = [...document.querySelectorAll(".eval-group")];
    expect(groups.map((group) => [...group.querySelectorAll(".eval-entry")].map(nameOf))).toEqual([
      ["Use the latest instruction"],
      ["Carry constraints through a handoff", "Say when evidence is missing"],
      ["Keep requirements after compaction"],
    ]);
    expect(document.querySelector(".eval-group.fewer h2 .title")?.textContent).toBe("Fewer passed");
  });

  it("adds the still running group for the live fixture", () => {
    ledgerOf(createLiveEvalDemo());
    expect(headings()).toEqual([
      "Fewer passed|1 case",
      "More passed|1 case",
      "Not comparable|1 case",
      "Still running|2 cases",
    ]);
    const running = [...document.querySelectorAll(".eval-group.running .eval-entry")];
    expect(running.map(nameOf)).toEqual(["Say when evidence is missing", "Finish within the tool budget"]);
    expect(running.map((item) => item.querySelector(".eval-word")?.textContent)).toEqual(["1 still running", "3 still running"]);
    expect(document.querySelectorAll(".eval-word.fewer")).toHaveLength(1);
  });

  it("renders no group for an empty experiment and says so", () => {
    ledgerOf({ ...createEvalDemo(), cases: [] });
    expect(screen.getByText("No cases in this experiment yet.")).toBeTruthy();
    expect(document.querySelector(".eval-group")).toBeNull();
    expect(document.querySelector(".eval-fold")).toBeNull();
  });
});

describe("trial mark shapes", () => {
  function svgOf(caseId: string, index: number): Element {
    const svg = entry(caseId).querySelectorAll(".eval-mark svg")[index];
    if (svg === undefined) {
      throw new Error(`${caseId} ${index}`);
    }
    return svg;
  }

  it("draws the fail cross with the comp geometry", () => {
    ledgerOf(createEvalDemo());
    const path = svgOf("latest-instruction", 4).querySelector("path");
    expect(path?.getAttribute("d")).toBe("M3.2 3.2 10.8 10.8M10.8 3.2 3.2 10.8");
    expect(path?.getAttribute("stroke-width")).toBe("1.8");
    expect(path?.getAttribute("stroke-linecap")).toBe("round");
    expect(path?.getAttribute("stroke")).toBe("var(--rose-ink)");
  });

  it("draws not eligible as a dashed ring with butt caps so the gaps stay open", () => {
    ledgerOf(createEvalDemo());
    const ring = svgOf("compaction-requirements", 3).querySelector("circle");
    expect(ring?.getAttribute("stroke-dasharray")).toBe("2.2 2");
    expect(ring?.getAttribute("stroke-width")).toBe("1.6");
    expect(ring?.getAttribute("stroke-linecap")).toBeNull();
    expect(ring?.getAttribute("fill")).toBe("none");
  });

  it("keeps unknown a solid ring, distinct from not eligible", () => {
    ledgerOf(createEvalDemo(), null, true);
    const ring = svgOf("source-evidence", 4).querySelector("circle");
    expect(ring?.getAttribute("stroke-dasharray")).toBeNull();
    expect(ring?.getAttribute("fill")).toBe("none");
  });
});

describe("Ledger fold", () => {
  const names =
    "Deliver a working API change · Find the relevant repository guidance · Support claims with source evidence (1 awaiting a label) · Finish within the tool budget";

  it("folds the unchanged cases into one button line", () => {
    ledgerOf(createEvalDemo());
    const fold = screen.getByRole("button", { name: /unchanged/ });
    expect(fold.querySelector("b")?.textContent).toBe("4 unchanged");
    expect(fold.querySelector(".names")?.textContent).toBe(names);
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    expect(fold.querySelectorAll(".eval-mark")).toHaveLength(3);
    expect(fold.querySelector("svg.eval-fold-chevron")).not.toBeNull();
    expect(document.getElementById("eval-unchanged")).toBeNull();
    expect(document.querySelectorAll(".eval-entry")).toHaveLength(4);
  });

  it("lists the unchanged entries in suite order when expanded", () => {
    ledgerOf(createEvalDemo(), null, true);
    const fold = screen.getByRole("button", { name: /unchanged/ });
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    expect(fold.querySelector(".names")).toBeNull();
    expect(fold.querySelector("b")?.textContent).toBe("4 unchanged");
    expect(fold.querySelectorAll(".eval-mark")).toHaveLength(3);
    expect(fold.querySelector("svg.eval-fold-chevron")).not.toBeNull();
    expect([...document.querySelectorAll("#eval-unchanged .eval-entry")].map(nameOf)).toEqual([
      "Deliver a working API change",
      "Find the relevant repository guidance",
      "Support claims with source evidence",
      "Finish within the tool budget",
    ]);
    expect(entry("api-change").querySelector(".eval-word")?.textContent).toBe("same");
  });
});

describe("LedgerEntry", () => {
  it("is one button while closed, with decorative marks and a spoken trial summary", () => {
    ledgerOf(createEvalDemo());
    const closed = entry("handoff-constraints");
    expect(closed.querySelectorAll("button")).toHaveLength(1);
    const trigger = within(closed).getByRole("button");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBeNull();
    expect(closed.querySelectorAll(".eval-marks[aria-hidden='true'] .eval-mark")).toHaveLength(6);
    expect(trigger.querySelector(".sr-only")?.textContent).toBe(
      "Baseline: passed, failed, failed. Candidate: passed, passed, passed.",
    );
    expect(closed.classList.contains("open")).toBe(false);
  });

  it("writes the caption and change words of a closed entry from the data", () => {
    ledgerOf(createEvalDemo());
    const handoff = entry("handoff-constraints");
    expect(handoff.querySelector(".eval-cap")?.textContent).toBe(
      "Context management · baseline trials 2 and 3 failed: constraint missing from the handoff; the diff touches src/shared/money.ts.",
    );
    expect(handoff.querySelector(".eval-word")?.textContent).toBe("2 more passed");
    expect(handoff.querySelector(".eval-name .eval-rev")?.textContent).toBe("v3");
    expect(entry("missing-evidence").querySelector(".eval-cap")?.textContent).toBe(
      "Grounding · baseline trial 2 failed: names a cause the log does not support. Candidate trial 1 regraded g2 failed → g3 passed.",
    );
    const compaction = entry("compaction-requirements");
    expect(compaction.querySelector(".eval-cap")?.textContent).toBe(
      "Setup ineligible: the candidate host did not compact in this run",
    );
    expect(compaction.querySelector(".eval-word")).toBeNull();
    expect(entry("latest-instruction").querySelector(".eval-cap")?.textContent).toBe(
      "Context management · candidate trial 2 failed: delivered limit is 60 requests per minute; the requirement is 100.",
    );
  });

  it("shows the selected trial inline with both rails when open", () => {
    ledgerOf(createEvalDemo(), LATEST);
    const open = entry("latest-instruction");
    expect(open.classList.contains("open")).toBe(true);
    const trigger = within(open).getAllByRole("button")[0];
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(trigger?.getAttribute("aria-controls")).toBe("eval-detail-latest-instruction");
    expect(document.getElementById("eval-detail-latest-instruction")).not.toBeNull();
    expect(open.querySelector(".eval-cap")?.textContent).toBe("Context management · executable grader");
    const word = open.querySelector(".eval-word");
    expect(word?.textContent).toBe(
      "1 fewer passed · candidate trial 2 failed: delivered limit is 60 requests per minute; the requirement is 100.",
    );
    expect(word?.classList.contains("fewer")).toBe(true);
    const [expected, delivered] = [...open.querySelectorAll(".eval-rail")];
    expect(expected?.querySelector(".eval-from")?.textContent).toBe("Expected · public requirement");
    expect(expected?.querySelector("blockquote")?.textContent).toBe(
      "Apply the updated rate limit: 100 requests per minute. The earlier limit of 60 is superseded.",
    );
    expect(expected?.querySelector(".eval-chip")?.textContent).toBe("user-message-07");
    expect(delivered?.querySelector(".eval-from")?.textContent).toBe("Delivered · candidate trial 2");
    expect(delivered?.querySelector("blockquote")?.textContent).toBe(
      "Kept the limit at 60 requests per minute and wrote the new route test against that value.",
    );
    expect(delivered?.querySelector(".eval-chip")?.textContent).toBe("src/middleware/rate-limit.ts:18");
  });

  it("makes only the selected mark pressed and every mark a named button when open", () => {
    ledgerOf(createEvalDemo(), LATEST);
    const open = entry("latest-instruction");
    expect(within(open).getAllByRole("button", { pressed: true }).map((mark) => mark.getAttribute("aria-label"))).toEqual([
      "Trial 2, candidate: failed",
    ]);
    expect(open.querySelectorAll("button.eval-mark")).toHaveLength(6);
    expect(entry("handoff-constraints").querySelectorAll("button.eval-mark")).toHaveLength(0);
  });

  it("has no separate verdict row and keeps the check line below the rails", () => {
    ledgerOf(createEvalDemo(), LATEST);
    const facts = entry("latest-instruction").querySelector(".eval-facts");
    const rows = [...(facts?.querySelectorAll(":scope > div") ?? [])].map((row) => row.querySelector("dt")?.textContent);
    expect(rows).toEqual(["Checks"]);
    expect(entry("latest-instruction").textContent?.includes("Verdict")).toBe(false);
    expect(facts?.querySelector(".eval-list li")?.textContent).toBe(
      "rate-limit-value-check g3 executable \u00b7 failed \u00b7 Expected limit 100, found 60",
    );
    expect(facts?.querySelector(".eval-list li .eval-chip")?.textContent).toBe("g3");
    expect(facts?.querySelector(".eval-result")?.classList.contains("failed")).toBe(true);
  });

  it("describes the selected trial in the change line, tinted only for a regression or a failed trial", () => {
    ledgerOf(createEvalDemo(), { caseId: "latest-instruction", side: "candidate", attempt: 1 });
    const word = entry("latest-instruction").querySelector(".eval-word");
    expect(word?.textContent).toBe("1 fewer passed \u00b7 candidate trial 1 passed");
    expect(word?.classList.contains("fewer")).toBe(true);
    cleanup();
    ledgerOf(createEvalDemo(), { caseId: "handoff-constraints", side: "baseline", attempt: 1 });
    const improved = entry("handoff-constraints").querySelector(".eval-word");
    expect(improved?.textContent).toBe("2 more passed \u00b7 baseline trial 1 passed");
    expect(improved?.classList.contains("fewer")).toBe(false);
    cleanup();
    ledgerOf(createEvalDemo(), { caseId: "handoff-constraints", side: "baseline", attempt: 2 });
    const failed = entry("handoff-constraints").querySelector(".eval-word");
    expect(failed?.textContent).toBe(
      "2 more passed \u00b7 baseline trial 2 failed: constraint missing from the handoff; the diff touches src/shared/money.ts.",
    );
    expect(failed?.classList.contains("fewer")).toBe(true);
  });

  it("puts the not-eligible reason in the delivered slot and lists missing data", () => {
    ledgerOf(createEvalDemo(), { caseId: "compaction-requirements", side: "candidate", attempt: 1 });
    const open = entry("compaction-requirements");
    const delivered = open.querySelectorAll(".eval-rail")[1];
    expect(delivered?.querySelector(".eval-from")?.textContent).toBe("Delivered · candidate trial 1");
    expect(delivered?.querySelector("blockquote")?.textContent).toBe(
      "Setup ineligible: the candidate host did not compact in this run",
    );
    expect(open.querySelector(".eval-word")?.textContent).toBe(
      "not comparable \u00b7 candidate trial 1 not eligible: setup ineligible: the candidate host did not compact in this run",
    );
    const rows = [...open.querySelectorAll(".eval-facts > div")].map((row) => row.querySelector("dt")?.textContent);
    expect(rows).toEqual(["Checks", "Missing data"]);
    expect(open.querySelector(".eval-facts .eval-result")).toBeNull();
    expect(open.textContent).toContain("No compaction event in the trace");
  });

  it("shows the unknown trial's excerpt and its reason", () => {
    ledgerOf(createEvalDemo(), { caseId: "source-evidence", side: "candidate", attempt: 2 }, true);
    const open = entry("source-evidence");
    expect(open.querySelectorAll(".eval-rail")[1]?.querySelector("blockquote")?.textContent).toContain("lockfile is stale");
    expect(open.querySelector(".eval-word")?.textContent).toBe("same · candidate trial 2 unknown: awaiting human label");
  });

  it("lists regrades oldest first for the regraded trial only", () => {
    ledgerOf(createEvalDemo(), { caseId: "missing-evidence", side: "candidate", attempt: 1 });
    const items = [...entry("missing-evidence").querySelectorAll("ol.eval-list li")].map((item) => item.textContent);
    expect(items).toEqual(["g2 · failed · 2026-10-08", "g3 · passed · 2026-10-09"]);
    cleanup();
    ledgerOf(createEvalDemo(), { caseId: "missing-evidence", side: "candidate", attempt: 2 });
    expect(entry("missing-evidence").querySelector("ol.eval-list")).toBeNull();
  });

  it("says nothing was delivered for a running trial", () => {
    ledgerOf(createLiveEvalDemo(), { caseId: "tool-budget", side: "candidate", attempt: 1 });
    const open = entry("tool-budget");
    expect(open.querySelectorAll(".eval-rail")[1]?.textContent).toContain("Nothing delivered for this trial.");
    expect(open.querySelector(".eval-word")?.textContent).toBe("3 still running \u00b7 candidate trial 1 running");
  });
});

describe("ValidityPanel", () => {
  function lines(experiment: EvalExperiment): Record<string, (string | null)[]> {
    render(<ValidityPanel experiment={experiment} />);
    return Object.fromEntries(
      [...document.querySelectorAll(".eval-check > div")].map((row) => [
        row.querySelector("dt")?.textContent ?? "",
        [...row.querySelectorAll("dd > div")].map((line) => line.textContent),
      ]),
    );
  }

  it("states each validity fact the fixture supports on its own line", () => {
    const facts = lines(createEvalDemo());
    expect(screen.getByRole("heading", { name: "Is this comparison valid?" })).toBeTruthy();
    expect(facts).toEqual({
      Cases: ["Same 8 cases on both sides"],
      Grader: ["g3 on both arms, 1 trial regraded"],
      Excluded: [
        "1 baseline trial \u00b7 Excluded: provider outage during the trial, declared before analysis",
        "3 candidate trials \u00b7 Setup ineligible: the candidate host did not compact in this run",
      ],
      Unlabeled: ["1 candidate trial \u00b7 Awaiting human label"],
    });
  });

  it("adds a running line while the experiment is in progress", () => {
    expect(lines(createLiveEvalDemo())["Running"]).toEqual(["4 candidate trials still running"]);
  });
});

describe("MeasuresList", () => {
  function row(id: string): HTMLElement {
    const found = document.querySelector<HTMLElement>(`[data-measure="${id}"]`);
    if (found === null) {
      throw new Error(id);
    }
    return found;
  }

  it("shows the paired values and one change line with interval and coverage, separated", () => {
    render(<MeasuresList measures={createEvalDemo().measures} />);
    expect(row("outcome").querySelector(".eval-m-value")?.textContent).toBe("15 of 20 \u2192 17 of 20 trials");
    expect(row("outcome").querySelector(".eval-m-change")?.textContent).toBe(
      "2 more trials passed\u00a0\u00b7 interval \u22121 to +5\u00a0\u00b7 7 of 8 cases",
    );
    expect(row("workflow-compliance").querySelector(".eval-m-value")?.textContent).toBe("9 of 12 \u2192 10 of 12 trials");
    expect(row("workflow-compliance").querySelector(".eval-m-change")?.textContent).toBe(
      "1 more trial passed\u00a0\u00b7 interval \u22122 to +4\u00a0\u00b7 4 of 5 cases",
    );
    expect(row("grounding").querySelector(".eval-m-value")?.textContent).toBe("4 of 6 \u2192 5 of 5 trials");
    expect(row("grounding").querySelector(".eval-m-change")?.textContent).toBe(
      "1 more trial passed\u00a0\u00b7 interval \u22121 to +3\u00a0\u00b7 2 of 2 cases\u00a0\u00b7 1 trial awaiting a human label",
    );
    expect(document.querySelector(".eval-m-note")).toBeNull();
    expect(document.body.textContent).not.toContain("Excludes Keep requirements");
    expect(document.body.textContent).not.toContain("Median over the finished trials");
  });

  it("renders every phrase of a change line as its own nowrap element", () => {
    render(<MeasuresList measures={createEvalDemo().measures} />);
    const phrases = (id: string) => [...row(id).querySelectorAll(".eval-m-change > .eval-phrase")].map((node) => node.textContent);
    expect(phrases("efficiency")).toEqual(["26s faster", "interval \u221241s to +8s", "2 fewer calls", "interval \u22125 to +1", "1 of 1 case"]);
    expect(phrases("outcome")).toEqual(["2 more trials passed", "interval \u22121 to +5", "7 of 8 cases"]);
    expect(phrases("grounding")).toEqual(["1 more trial passed", "interval \u22121 to +3", "2 of 2 cases", "1 trial awaiting a human label"]);
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "evals.css"), "utf8");
    expect(topLevelBlocks(css).find((block) => block.prelude === ".eval-phrase")?.body).toContain("white-space: nowrap");
    expect(row("efficiency").querySelector(".eval-m-change")?.textContent).toBe(
      "26s faster\u00a0\u00b7 interval \u221241s to +8s\u00a0\u00b7 2 fewer calls\u00a0\u00b7 interval \u22125 to +1\u00a0\u00b7 1 of 1 case",
    );
  });

  it("shows both efficiency measures as one Efficiency row", () => {
    render(<MeasuresList measures={createEvalDemo().measures} />);
    expect([...document.querySelectorAll(".eval-m-name")].map((node) => node.textContent)).toEqual([
      "Outcome",
      "Workflow compliance",
      "Grounding",
      "Context",
      "Efficiency",
    ]);
    expect(row("efficiency").querySelector(".eval-m-value")?.textContent).toBe("2m 04s \u2192 1m 38s \u00b7 13 \u2192 11 calls");
    expect(row("efficiency").querySelector(".eval-m-change")?.textContent).toBe(
      "26s faster\u00a0\u00b7 interval \u221241s to +8s\u00a0\u00b7 2 fewer calls\u00a0\u00b7 interval \u22125 to +1\u00a0\u00b7 1 of 1 case",
    );
    expect(document.querySelectorAll("[data-measure^='efficiency']")).toHaveLength(1);
  });

  it("writes an unavailable half inline and keeps the available half's values", () => {
    const measures = createEvalDemo().measures.map((measure) =>
      measure.id === "efficiency-calls"
        ? { kind: "unavailable" as const, id: measure.id, name: measure.name, reason: "No tool-call count captured" }
        : measure,
    );
    render(<MeasuresList measures={measures} />);
    expect(row("efficiency").querySelector(".eval-m-value")?.textContent).toBe("2m 04s \u2192 1m 38s");
    expect(row("efficiency").querySelector(".eval-m-change")?.textContent).toBe(
      "26s faster\u00a0\u00b7 interval \u221241s to +8s\u00a0\u00b7 Not available: no tool-call count captured\u00a0\u00b7 1 of 1 case",
    );
  });

  it("writes an unavailable measure with its reason, never a zero", () => {
    render(<MeasuresList measures={createEvalDemo().measures} />);
    expect(row("context").textContent).toBe("ContextNot available: no trace captured for compaction cases");
    expect(row("context").textContent).not.toContain("0");
    expect(row("context").querySelector(".eval-m-value")).toBeNull();
  });

  it("marks the unavailable measures of a running experiment once per reason", () => {
    render(<MeasuresList measures={createLiveEvalDemo().measures} />);
    expect(row("outcome").textContent).toBe("OutcomeNot available: experiment still running");
    expect(row("efficiency").textContent).toBe("EfficiencyNot available: experiment still running");
    expect(row("workflow-compliance").querySelector(".eval-m-value")?.textContent).toBe("9 of 12 \u2192 10 of 12 trials");
  });
});

describe("KeyLine", () => {
  it("lists the keyboard paths", () => {
    render(<KeyLine />);
    expect(screen.getByLabelText("Keyboard shortcuts").textContent).toBe(
      "↑↓ entries · Enter open · 1 to 9 trial · n next regression · Esc close",
    );
    expect(document.querySelectorAll("kbd")).toHaveLength(6);
  });
});

describe("ExperimentLine", () => {
  it("states what was compared, the grader, the size and the status", () => {
    render(<ExperimentLine experiment={createEvalDemo()} regressionCount={1} onNextRegression={() => undefined} />);
    expect(screen.getByText("Workflow essentials")).toBeTruthy();
    expect(screen.getByText("synthetic demo")).toBeTruthy();
    expect(document.querySelector(".run-meta")?.textContent).toBe(
      "Baseline v0.8 → Candidate v0.9 context handoff · grader g3 · 8 cases × 3 trials · complete",
    );
  });

  it("shows in progress for a running experiment", () => {
    render(<ExperimentLine experiment={createLiveEvalDemo()} regressionCount={0} onNextRegression={() => undefined} />);
    expect(document.querySelector(".run-meta")?.textContent?.endsWith(" · in progress")).toBe(true);
  });

  it("offers the regression count as a control, singular and plural", () => {
    const { rerender } = render(<ExperimentLine experiment={createEvalDemo()} regressionCount={1} onNextRegression={() => undefined} />);
    expect(screen.getByRole("button", { name: "1 regression" })).toBeTruthy();
    rerender(<ExperimentLine experiment={createEvalDemo()} regressionCount={2} onNextRegression={() => undefined} />);
    expect(screen.getByRole("button", { name: "2 regressions" })).toBeTruthy();
  });

  it("says no regressions as plain text, and so far while running", () => {
    const { rerender } = render(<ExperimentLine experiment={createEvalDemo()} regressionCount={0} onNextRegression={() => undefined} />);
    expect(screen.getByText("no regressions")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<ExperimentLine experiment={createLiveEvalDemo()} regressionCount={0} onNextRegression={() => undefined} />);
    expect(screen.getByText("no regressions so far")).toBeTruthy();
  });

  it("hides the synthetic tag for real data", () => {
    render(<ExperimentLine experiment={{ ...createEvalDemo(), synthetic: false }} regressionCount={0} onNextRegression={() => undefined} />);
    expect(screen.queryByText("synthetic demo")).toBeNull();
  });
});

describe("evals.css layout guards", () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "evals.css"), "utf8");
  const blocks = topLevelBlocks(css);
  const bodyOf = (prelude: string) => blocks.find((block) => block.prelude === prelude)?.body ?? "";

  it("lays the screen out as the ledger and a 420px column", () => {
    expect(bodyOf(".app.eval-app")).toContain("grid-template-columns: minmax(0, 1fr) 420px");
  });

  it("sets every numeric figure rule with lining and tabular figures", () => {
    const rules = css.split("\n").filter((line) => line.includes("font-variant-numeric"));
    expect(rules.length).toBeGreaterThanOrEqual(3);
    for (const rule of rules) {
      expect(rule).toContain("lining-nums tabular-nums");
    }
  });

  it("rotates the fold chevron when open and keeps it still for reduced motion", () => {
    expect(bodyOf('.eval-fold[aria-expanded="true"] .eval-fold-chevron')).toContain("rotate(90deg)");
    expect(bodyOf(".eval-fold-chevron")).toContain("transition: transform var(--duration-hover) ease");
    const reduced = blocks.find((block) => block.prelude === "@media (prefers-reduced-motion: reduce)");
    expect(reduced?.body).toContain(".eval-fold-chevron");
    expect(reduced?.body).toContain("transition: none");
  });

  it("drives the ledger layout from the left column width", () => {
    expect(bodyOf(".eval-ledger")).toContain("container-type: inline-size");
    const query = blocks.find((block) => block.prelude === "@container (max-width: 759px)");
    expect(query?.body).toContain(".eval-diff");
    expect(query?.body).toContain("grid-template-columns: 1fr");
    expect(query?.body).toContain(".eval-sides");
  });

  it("moves the validity column below the ledger under 900px and hides the key line", () => {
    const narrow = blocks.find((block) => block.prelude === "@media (max-width: 900px)");
    expect(narrow?.body).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(narrow?.body).toContain(".eval-keys");
    expect(narrow?.body).toContain("display: none");
  });

  it("draws the marks as 16px faces and stills the running dot for reduced motion", () => {
    expect(bodyOf(".eval-ledger,\n.eval-aside")).toContain("--mark-face: 16px");
    const reduced = blocks.find((block) => block.prelude === "@media (prefers-reduced-motion: reduce)");
    expect(reduced?.body).toContain("animation: none");
  });
});
