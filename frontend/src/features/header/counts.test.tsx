import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { toRealSession } from "@/model";
import type { ModelSession } from "@/model";
import { Counts, COUNT_ORDER } from "./Counts";
import { agentOf, sessionOf } from "@/test/testSupport";

function sessionWithRunning(id: string, runningCount: number): ModelSession {
  const agents = Array.from({ length: runningCount }, (_, index) => agentOf(index + 1));
  return toRealSession(sessionOf(id, id, { agents }), 1);
}

function bumpedStates(container: HTMLElement): string[] {
  return COUNT_ORDER.filter((state) => container.querySelector(`.count[data-state="${state}"] b`)?.classList.contains("bump"));
}

function renderCounts(session: ModelSession) {
  return <Counts session={session} now={10} onCycle={() => undefined} />;
}

describe("Counts bump", () => {
  it("does not bump on the first render", () => {
    const { container } = render(renderCounts(sessionWithRunning("a", 2)));
    expect(container.querySelector('.count[data-state="running"] b')?.textContent).toBe("2");
    expect(bumpedStates(container)).toEqual([]);
  });

  it("bumps only the badge whose total changed for the same session", () => {
    const { container, rerender } = render(renderCounts(sessionWithRunning("a", 2)));
    rerender(renderCounts(sessionWithRunning("a", 3)));
    expect(container.querySelector('.count[data-state="running"] b')?.textContent).toBe("3");
    expect(bumpedStates(container)).toEqual(["running"]);
  });

  it("does not bump after switching to a different session", () => {
    const { container, rerender } = render(renderCounts(sessionWithRunning("a", 2)));
    rerender(renderCounts(sessionWithRunning("b", 3)));
    expect(container.querySelector('.count[data-state="running"] b')?.textContent).toBe("3");
    expect(bumpedStates(container)).toEqual([]);
  });
});
