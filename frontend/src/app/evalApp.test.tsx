import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { EvalExperiment } from "@/model";
import { createEvalDemo, createLiveEvalDemo } from "@/demo/evals";
import { setUpAppTestEnvironment, stubMatchMedia } from "@/test/testSupport";
import { EvalApp } from "./EvalApp";

setUpAppTestEnvironment();

function entry(title: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>(".eval-entry")].find(
    (item) => item.querySelector(".eval-name")?.childNodes[0]?.textContent === title,
  );
  if (found === null || found === undefined) {
    throw new Error(`No entry ${title}`);
  }
  return found;
}

function trigger(title: string): HTMLElement {
  const found = entry(title).querySelector<HTMLElement>(".eval-trigger");
  if (found === null) {
    throw new Error(title);
  }
  return found;
}

function openTitles(): (string | null | undefined)[] {
  return [...document.querySelectorAll(".eval-entry.open")].map((item) => item.querySelector(".eval-name")?.childNodes[0]?.textContent);
}

function mark(title: string, name: string): HTMLElement {
  return within(entry(title)).getByRole("button", { name });
}

function shown(): { from: string | null | undefined; word: string | null | undefined } {
  const open = document.querySelector(".eval-entry.open");
  return {
    from: open?.querySelectorAll(".eval-from")[1]?.textContent,
    word: open?.querySelector(".eval-word")?.textContent,
  };
}

function press(key: string, init: KeyboardEventInit = {}, target: Element | Document = document.body): void {
  fireEvent.keyDown(target, { key, ...init });
}

function activeLabel(): [string | null | undefined, string | null | undefined] {
  const active = document.activeElement;
  return [active?.closest(".eval-entry")?.querySelector(".eval-name")?.childNodes[0]?.textContent, active?.getAttribute("aria-label")];
}

function withSecondRegression(): EvalExperiment {
  const experiment = createEvalDemo();
  return {
    ...experiment,
    cases: experiment.cases.map((evalCase) =>
      evalCase.id === "missing-evidence"
        ? { ...evalCase, baseline: evalCase.candidate, candidate: evalCase.baseline }
        : evalCase,
    ),
  };
}

describe("EvalApp", () => {
  it("opens the regression by default on candidate trial 2 with both rails", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    expect(openTitles()).toEqual(["Use the latest instruction"]);
    expect(trigger("Use the latest instruction").getAttribute("aria-expanded")).toBe("true");
    expect(mark("Use the latest instruction", "Trial 2, candidate: failed").getAttribute("aria-pressed")).toBe("true");
    const open = within(entry("Use the latest instruction"));
    expect(open.getByText("Apply the updated rate limit: 100 requests per minute. The earlier limit of 60 is superseded.")).toBeTruthy();
    expect(open.getByText("user-message-07").classList.contains("eval-chip")).toBe(true);
    expect(open.getByText("src/middleware/rate-limit.ts:18").classList.contains("eval-chip")).toBe(true);
    expect(shown().from).toBe("Delivered · candidate trial 2");
    expect(document.querySelectorAll("[aria-expanded='true']")).toHaveLength(1);
  });

  it("opens another entry on its default trial and closes the previous one", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    fireEvent.click(trigger("Carry constraints through a handoff"));
    expect(openTitles()).toEqual(["Carry constraints through a handoff"]);
    expect(mark("Carry constraints through a handoff", "Trial 2, baseline: failed").getAttribute("aria-pressed")).toBe("true");
    expect(shown()).toEqual({
      from: "Delivered · baseline trial 2",
      word: "2 more passed · baseline trial 2 failed: constraint missing from the handoff; the diff touches src/shared/money.ts.",
    });
    expect(trigger("Use the latest instruction").getAttribute("aria-expanded")).toBe("false");
    expect(entry("Use the latest instruction").querySelector(".eval-detail")).toBeNull();
    expect(entry("Use the latest instruction").querySelectorAll("button")).toHaveLength(1);
  });

  it("opens a closed entry from a click anywhere on it", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    fireEvent.click(entry("Keep requirements after compaction").querySelector(".eval-cap") as Element);
    expect(openTitles()).toEqual(["Keep requirements after compaction"]);
    expect(shown()).toEqual({
      from: "Delivered · candidate trial 1",
      word: "not comparable · candidate trial 1 not eligible: setup ineligible: the candidate host did not compact in this run",
    });
  });

  it("switches the inline trial from a mark and keeps the entry open", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    fireEvent.click(mark("Use the latest instruction", "Trial 3, candidate: passed"));
    expect(openTitles()).toEqual(["Use the latest instruction"]);
    expect(shown()).toEqual({ from: "Delivered · candidate trial 3", word: "1 fewer passed · candidate trial 3 passed" });
    expect(mark("Use the latest instruction", "Trial 3, candidate: passed").getAttribute("aria-pressed")).toBe("true");
    expect(mark("Use the latest instruction", "Trial 2, candidate: failed").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(mark("Use the latest instruction", "Trial 2, baseline: passed"));
    expect(shown().from).toBe("Delivered · baseline trial 2");
  });

  it("closes the open entry from its trigger", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    fireEvent.click(trigger("Use the latest instruction"));
    expect(openTitles()).toEqual([]);
    expect(trigger("Use the latest instruction").getAttribute("aria-expanded")).toBe("false");
  });

  it("expands the unchanged fold and opens an entry from it, and closes that entry when the fold collapses", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    const fold = screen.getByRole("button", { name: /unchanged/ });
    fireEvent.click(fold);
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(trigger("Support claims with source evidence"));
    expect(openTitles()).toEqual(["Support claims with source evidence"]);
    expect(shown()).toEqual({ from: "Delivered · candidate trial 1", word: "same · candidate trial 1 passed" });
    fireEvent.click(fold);
    expect(document.getElementById("eval-unchanged")).toBeNull();
    expect(openTitles()).toEqual([]);
  });

  it("opens the next regression with n, wrapping, and focuses its entry", () => {
    render(<EvalApp experiment={withSecondRegression()} />);
    press("n");
    expect(openTitles()).toEqual(["Say when evidence is missing"]);
    expect(shown().from).toBe("Delivered · candidate trial 2");
    expect(document.activeElement).toBe(trigger("Say when evidence is missing"));
    press("n");
    expect(openTitles()).toEqual(["Use the latest instruction"]);
    expect(document.activeElement).toBe(trigger("Use the latest instruction"));
  });

  it("moves focus between entries with the arrow keys and j and k, without opening them", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    press("ArrowDown");
    expect(document.activeElement).toBe(trigger("Carry constraints through a handoff"));
    expect(openTitles()).toEqual(["Use the latest instruction"]);
    press("j");
    expect(document.activeElement).toBe(trigger("Say when evidence is missing"));
    press("ArrowUp");
    press("k");
    expect(document.activeElement).toBe(trigger("Use the latest instruction"));
    press("k");
    expect(document.activeElement).toBe(trigger("Use the latest instruction"));
  });

  it("walks onto the fold line and stops at the last entry", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    for (let step = 0; step < 8; step += 1) {
      press("ArrowDown");
    }
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /unchanged/ }));
  });

  it("opens the focused entry on Enter or Space", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    press("ArrowDown");
    fireEvent.click(document.activeElement as Element);
    expect(openTitles()).toEqual(["Carry constraints through a handoff"]);
    expect(document.activeElement).toBe(trigger("Carry constraints through a handoff"));
  });

  it("picks a trial in the open entry with the digit keys and moves focus to its mark", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    press("1");
    expect(shown()).toEqual({ from: "Delivered · candidate trial 1", word: "1 fewer passed · candidate trial 1 passed" });
    expect(activeLabel()).toEqual(["Use the latest instruction", "Trial 1, candidate: passed"]);
    expect(document.activeElement?.getAttribute("aria-pressed")).toBe("true");
    press("3");
    expect(activeLabel()).toEqual(["Use the latest instruction", "Trial 3, candidate: passed"]);
    press("9");
    expect(shown().from).toBe("Delivered · candidate trial 3");
  });

  it("ignores digits when no entry is open", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    press("Escape");
    press("2");
    expect(openTitles()).toEqual([]);
  });

  it("closes the open entry with Escape and returns focus to its trigger", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    press("Escape");
    expect(openTitles()).toEqual([]);
    expect(document.activeElement).toBe(trigger("Use the latest instruction"));
    expect(trigger("Use the latest instruction").getAttribute("aria-expanded")).toBe("false");
    press("Escape");
    expect(openTitles()).toEqual([]);
  });

  it("opens the next regression from the link in the experiment line", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    fireEvent.click(trigger("Carry constraints through a handoff"));
    fireEvent.click(screen.getByRole("button", { name: "1 regression" }));
    expect(openTitles()).toEqual(["Use the latest instruction"]);
    expect(shown().from).toBe("Delivered · candidate trial 2");
    expect(document.activeElement).toBe(trigger("Use the latest instruction"));
  });

  it("shows the validity facts and measures in the right column", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    const aside = within(screen.getByLabelText("Comparison validity and measures"));
    expect(aside.getByText("Same 8 cases on both sides")).toBeTruthy();
    expect(aside.getByText("g3 on both arms, 1 trial regraded")).toBeTruthy();
    expect(aside.getByText("1 candidate trial \u00b7 Awaiting human label")).toBeTruthy();
    expect(aside.getByText("3 candidate trials \u00b7 Setup ineligible: the candidate host did not compact in this run")).toBeTruthy();
    expect(aside.getByText("15 of 20 → 17 of 20 trials")).toBeTruthy();
    expect(aside.getByText("Not available: no trace captured for compaction cases")).toBeTruthy();
    expect(aside.getByLabelText("Keyboard shortcuts")).toBeTruthy();
  });

  it("ignores shortcuts with a modifier or while typing", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    press("ArrowDown", { ctrlKey: true });
    press("n", { metaKey: true });
    press("1", { altKey: true });
    const input = document.createElement("input");
    document.body.append(input);
    press("ArrowDown", {}, input);
    press("Escape", {}, input);
    input.remove();
    expect(openTitles()).toEqual(["Use the latest instruction"]);
    expect(shown().from).toBe("Delivered · candidate trial 2");
    expect(document.activeElement).toBe(document.body);
  });

  it("opens the live experiment with the running cases in their own group", () => {
    render(<EvalApp experiment={createLiveEvalDemo()} />);
    expect(screen.getByText((text) => text.endsWith(" · in progress"))).toBeTruthy();
    expect(openTitles()).toEqual(["Use the latest instruction"]);
    fireEvent.click(trigger("Finish within the tool budget"));
    expect(shown()).toEqual({ from: "Delivered · candidate trial 1", word: "3 still running · candidate trial 1 running" });
    press("n");
    expect(openTitles()).toEqual(["Use the latest instruction"]);
  });

  it("shows an empty state and stays quiet on keys when there are no cases", () => {
    render(<EvalApp experiment={{ ...createEvalDemo(), cases: [] }} />);
    expect(screen.getByText("No cases in this experiment yet.")).toBeTruthy();
    press("ArrowDown");
    press("n");
    press("1");
    expect(document.querySelector(".eval-entry")).toBeNull();
  });

  it("starts with every entry closed on a narrow screen", () => {
    stubMatchMedia({ narrow: true });
    render(<EvalApp experiment={createEvalDemo()} />);
    expect(openTitles()).toEqual([]);
    expect(document.querySelectorAll(".eval-trigger[aria-expanded='false']")).toHaveLength(4);
  });

  it("toggles the theme from the header", () => {
    render(<EvalApp experiment={createEvalDemo()} />);
    const toggle = document.getElementById("themeToggle");
    const before = toggle?.getAttribute("data-dark");
    expect(toggle).not.toBeNull();
    if (toggle !== null) {
      fireEvent.click(toggle);
    }
    expect(document.getElementById("themeToggle")?.getAttribute("data-dark")).not.toBe(before);
  });
});
