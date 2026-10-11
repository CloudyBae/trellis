import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { clockAt } from "@/lib/format";
import type { ViewProps } from "@/lib/viewProps";
import type { View } from "@/lib/view";
import { payloadSession } from "@/test/payloadSessions";
import { finishAnimation, stubReducedMotion } from "@/test/treeTestSupport";
import {
  TimelineHarness,
  lateAgent,
  queueAnimationFrames,
  restoreScroll,
  rowKeys,
  rowTops,
  stubScroll,
  scrollGardenTo,
  timelineProps,
  withLateAgent,
} from "./timelineTestSupport";

afterEach(() => {
  cleanup();
  restoreScroll();
  vi.useRealTimers();
  Reflect.deleteProperty(window, "matchMedia");
});

function rowText(key: string): string {
  return document.querySelector(`#rows [data-key="${key}"]`)?.textContent ?? "";
}

function agentGroup(id: number): Element {
  const group = document.querySelector(`#stems g.a[data-agent-id="${id}"]`);
  if (group === null) {
    throw new Error(`No stems for agent ${id}`);
  }
  return group;
}

describe("TimelineView rows", () => {
  it("lists spawn rows, return rows and the now row in layout order", () => {
    const session = payloadSession("claude/finished.json", 0);
    render(<TimelineHarness {...timelineProps(session, { now: 60 })} />);
    expect(rowKeys()).toEqual(["1spawn", "2spawn", "3spawn", "2ret", "3ret", "1ret"]);
    expect([...document.querySelectorAll("#rows > *")].map((row) => row.className || row.getAttribute("role"))).toEqual(
      Array(6).fill("listitem").concat(["row nowrow"]),
    );
    expect(document.querySelector("#graph")?.getAttribute("data-now")).toBe("60");
    const classes = (key: string) => document.querySelector(`[data-key="${key}"]`)?.className;
    expect(classes("1spawn")).toBe("row root");
    expect(classes("2spawn")).toBe("row");
    expect(classes("2ret")).toBe("row ret complete");
    expect(classes("3ret")).toBe("row ret failed");
    expect(document.querySelector("#rows")?.getAttribute("role")).toBe("list");
  });

  it("states each spawn row, returns, and the session end", () => {
    const session = payloadSession("claude/finished.json", 0);
    render(<TimelineHarness {...timelineProps(session, { now: 60 })} />);
    expect(rowText("2spawn")).toContain("Explorer");
    expect(document.querySelector('[data-key="3spawn"] .state')?.className).toBe("state s-failed");
    expect(document.querySelector('[data-key="3spawn"] .state')?.textContent).toBe("failed");
    expect(document.querySelector('[data-key="2spawn"] .num')?.textContent).toBe("+0:05");
    expect(document.querySelector('[data-key="2spawn"] .ricon use')?.getAttribute("href")).toBe("#r-explorer");
    expect(document.querySelector('[data-key="2spawn"] .l2')?.textContent).toBe("Find token call sites");
    expect(rowText("2ret")).toBe("+0:40Returned to Orchestrator after 35s: 14 call sites across 6 files.");
    expect(rowText("3ret")).toBe("+0:50Failed to Orchestrator after 44s: Agent crashed");
    expect(rowText("1ret")).toBe("+1:00Finished after 1m 00s: Done. Explorer found 14 sites.");
    expect(document.querySelector('[data-key="2ret"]')?.getAttribute("aria-label")).toBe("Explorer returned at +0:40 after 35s. 14 call sites across 6 files.");
    expect(document.querySelector('[data-key="3ret"]')?.getAttribute("aria-label")).toBe("Security reviewer failed at +0:50 after 44s. Agent crashed");
    expect(document.querySelector('[data-key="1ret"]')?.getAttribute("aria-label")).toBe("Orchestrator finished at +1:00 after 1m 00s. Done. Explorer found 14 sites.");
    expect(document.querySelector(".nowrow")?.textContent).toBe(`Session ended at ${clockAt(session.run.clock0, 60)}.`);
  });

  it("says how many agents are still growing in a live session", () => {
    const session = payloadSession("claude/live_blocked.json", 0);
    render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    expect(document.querySelector(".nowrow .l2")?.textContent).toBe(`Now, ${clockAt(session.run.clock0, 28)}. 3 agents still growing.`);
    expect(document.querySelector(".nowrow time")?.hasAttribute("data-clock")).toBe(true);
  });

  it("shows the handed-in chips only under the selected spawn row", () => {
    const session = payloadSession("claude/finished.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 60 })} />);
    expect(document.querySelector(".l3")).toBeNull();
    rerender(<TimelineHarness {...timelineProps(session, { now: 60, selectedId: 2 })} />);
    const handed = document.querySelectorAll(".l3");
    expect(handed).toHaveLength(1);
    expect(document.querySelector('[data-key="2spawn"] .l3 .hand')?.textContent).toBe("handed in");
    expect([...document.querySelectorAll('[data-key="2spawn"] .chip')].map((chip) => chip.textContent)).toEqual([
      "src/middleware/requireUser.ts",
    ]);
    expect(document.querySelector('[data-key="2spawn"]')?.getAttribute("aria-current")).toBe("true");
    expect(document.querySelectorAll('[aria-current="true"]')).toHaveLength(2);
  });

  it("selects an agent and asks for the pane when a row is clicked", () => {
    const session = payloadSession("claude/finished.json", 0);
    const onSelect = vi.fn();
    render(<TimelineHarness {...timelineProps(session, { now: 60, onSelect })} />);
    fireEvent.click(document.querySelector('[data-key="2ret"]') as Element);
    expect(onSelect).toHaveBeenCalledWith(2, { focusPane: true });
  });

  it("renders hostile agent text as text", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    const session = payloadSession("claude/finished.json", 0, (source) => ({
      ...source,
      agents: source.agents.map((agent) => ({
        ...agent,
        name: agent.id === 2 ? hostile : agent.name,
        brief: hostile,
        src: agent.id === 2 ? hostile : agent.src,
        returned: agent.returned ? { ...agent.returned, summary: hostile } : agent.returned,
      })),
    }));
    render(<TimelineHarness {...timelineProps(session, { now: 60 })} />);
    expect(document.querySelector("#rows img")).toBeNull();
    expect(document.querySelector('[data-key="2spawn"] .name')?.textContent).toBe(hostile);
    expect(document.querySelector('[data-key="2spawn"] .l2')?.textContent).toBe(hostile);
    expect(document.querySelector('[data-key="2ret"] b')?.textContent).toBe(hostile);
    expect(document.querySelector('[data-key="3ret"] b')?.textContent).toBe(hostile);
    expect(document.querySelector('[data-key="2spawn"] .src')?.textContent).toBe(hostile);
  });

  it("keeps every existing row at the same y when an agent is added", () => {
    const source = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(source, { now: 28 })} />);
    const before = rowTops();
    expect(Object.keys(before)).toEqual(["1spawn", "2spawn", "3spawn"]);
    const grown = payloadSession("claude/live_blocked.json", 0, (session) =>
      withLateAgent(session, lateAgent(9, 29)),
    );
    rerender(<TimelineHarness {...timelineProps(grown, { now: 29 })} />);
    const after = rowTops();
    expect(rowKeys()).toEqual(["1spawn", "2spawn", "3spawn", "9spawn"]);
    Object.entries(before).forEach(([key, top]) => expect(after[key]).toBe(top));
    expect(after["9spawn"]).not.toBe("");
  });
});

describe("TimelineView stems", () => {
  it("draws one wire per lane and one stem path per fork, vertical and merge", () => {
    const session = payloadSession("claude/finished.json", 0);
    render(<TimelineHarness {...timelineProps(session, { now: 60 })} />);
    expect(document.querySelectorAll("#stems .wire")).toHaveLength(3);
    expect([...document.querySelectorAll("#stems .stem")].map((path) => path.getAttribute("data-stem"))).toEqual([
      "v1",
      "f2",
      "v2",
      "m2",
      "f3",
      "v3",
      "m3",
    ]);
    expect([...document.querySelectorAll("#stems .knot ~ g use")].map((glyph) => glyph.getAttribute("href"))).toEqual([
      "#g-complete",
      "#g-complete",
      "#g-failed",
    ]);
    expect(document.querySelectorAll("#stems .tip")).toHaveLength(0);
    expect(document.querySelectorAll("#stems .a.done")).toHaveLength(3);
  });

  it("draws a running agent with its state glyph and a sprout, and lights the selected ancestry", () => {
    const session = payloadSession("claude/live_blocked.json", 0);
    render(<TimelineHarness {...timelineProps(session, { now: 28, selectedId: 2 })} />);
    expect(document.querySelector("#stems")?.classList.contains("has-sel")).toBe(true);
    expect(document.querySelectorAll("#stems .tip")).toHaveLength(3);
    const glyph = agentGroup(2).querySelector("use:not(.tip)");
    expect(glyph?.getAttribute("href")).toBe("#g-running");
    expect(glyph?.classList.contains("sway")).toBe(true);
    expect(agentGroup(1).classList.contains("lit")).toBe(true);
    expect(agentGroup(2).classList.contains("lit")).toBe(true);
    expect(agentGroup(3).classList.contains("lit")).toBe(false);
    expect(agentGroup(2).classList.contains("done")).toBe(false);
  });
});

describe("TimelineView motion", () => {
  it("draws nothing in with motion on the first render", () => {
    const session = payloadSession("claude/live_blocked.json", 0);
    render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    expect(document.querySelectorAll("#stems .grow, #stems .pop")).toHaveLength(0);
  });

  it("grows a new agent once and does not replay motion on later renders", () => {
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    const grown = payloadSession("claude/live_blocked.json", 0, (source) => withLateAgent(source, lateAgent(9, 29)));
    rerender(<TimelineHarness {...timelineProps(grown, { now: 29 })} />);
    const growing = () => [...document.querySelectorAll("#stems .grow")].map((path) => path.getAttribute("data-stem"));
    expect(growing()).toEqual(["f9", "v9"]);
    expect(agentGroup(9).querySelectorAll(".pop")).toHaveLength(1);
    expect(document.querySelectorAll("#stems .pop")).toHaveLength(1);

    rerender(<TimelineHarness {...timelineProps(grown, { now: 29, selectedId: 9 })} />);
    expect(growing()).toEqual(["f9", "v9"]);

    document.querySelectorAll("#stems .grow").forEach((path) => finishAnimation(path, "timeline-grow"));
    finishAnimation(agentGroup(9).querySelector(".pop") as Element, "timeline-pop");
    expect(document.querySelectorAll("#stems .grow, #stems .pop")).toHaveLength(0);

    rerender(<TimelineHarness {...timelineProps(grown, { now: 29, selectedId: 2 })} />);
    rerender(<TimelineHarness {...timelineProps(grown, { now: 29, selectedId: 2 })} />);
    expect(document.querySelectorAll("#stems .grow, #stems .pop")).toHaveLength(0);
  });

  it("does not replay motion when agents are unchanged", () => {
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    rerender(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    rerender(<TimelineHarness {...timelineProps(session, { now: 28, selectedId: 3 })} />);
    expect(document.querySelectorAll("#stems .grow, #stems .pop")).toHaveLength(0);
  });

  it("restarts the first-render gate for another session", () => {
    const first = payloadSession("claude/live_blocked.json", 0);
    const second = payloadSession("claude/finished.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(first, { now: 28 })} />);
    rerender(<TimelineHarness {...timelineProps(second, { now: 60 })} />);
    expect(document.querySelectorAll("#stems .grow, #stems .pop")).toHaveLength(0);
  });

  it("schedules no draw-in under reduced motion", () => {
    stubReducedMotion(true);
    const frames = queueAnimationFrames();
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    const grown = payloadSession("claude/live_blocked.json", 0, (source) => withLateAgent(source, lateAgent(9, 29)));
    rerender(<TimelineHarness {...timelineProps(grown, { now: 29 })} />);
    expect(document.querySelectorAll("#stems .grow, #stems .pop")).toHaveLength(0);
    expect(agentGroup(9).querySelectorAll(".stem")).toHaveLength(2);
    expect(frames.scheduled()).toBe(0);
  });

  it("fades a returned agent two frames after it returns, and not before", () => {
    const frames = queueAnimationFrames();
    const session = payloadSession("claude/finished.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 30 })} />);
    expect(document.querySelectorAll("#stems .a.done")).toHaveLength(0);
    rerender(<TimelineHarness {...timelineProps(session, { now: 41 })} />);
    expect(agentGroup(2).querySelector(".knot")).not.toBeNull();
    expect(agentGroup(2).classList.contains("done")).toBe(false);
    frames.flush();
    expect(agentGroup(2).classList.contains("done")).toBe(true);
    expect(agentGroup(3).classList.contains("done")).toBe(false);
  });
});

describe("TimelineView follow", () => {
  async function showView(
    view: View,
    rerender: (ui: ReactElement) => void,
    props: ViewProps,
  ): Promise<void> {
    await act(async () => {
      rerender(<TimelineHarness {...props} view={view} />);
    });
  }

  function growTo(contentBottom: number, scroll: ReturnType<typeof stubScroll>): void {
    scroll.contentBottom = contentBottom;
  }

  it("scrolls to the edge on entering the timeline and follows growth", () => {
    const scroll = stubScroll();
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    expect(scroll.scrollTo).toHaveBeenCalledTimes(1);
    expect(scroll.scrollTo).toHaveBeenLastCalledWith({ top: 1000 - (600 - 80) + 24, behavior: "auto" });
    growTo(1100, scroll);
    rerender(<TimelineHarness {...timelineProps(session, { now: 29 })} />);
    expect(scroll.scrollTo).toHaveBeenCalledTimes(2);
    expect(scroll.scrollTo).toHaveBeenLastCalledWith({ top: 504 + (1100 - 504) - 520 + 24, behavior: "smooth" });
  });

  it("does not subtract a static legend from the visible edge", () => {
    const scroll = stubScroll({ legendPosition: "static" });
    const session = payloadSession("claude/live_blocked.json", 0);
    render(<TimelineHarness {...timelineProps(session, { now: 28, narrow: true })} />);
    expect(scroll.scrollTo).toHaveBeenLastCalledWith({ top: 1000 - 600 + 24, behavior: "auto" });
  });

  it("scrolls without animation under reduced motion", () => {
    stubReducedMotion(true);
    const scroll = stubScroll();
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    growTo(1100, scroll);
    rerender(<TimelineHarness {...timelineProps(session, { now: 29 })} />);
    expect(scroll.scrollTo).toHaveBeenCalledTimes(2);
    expect(scroll.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "auto" }));
  });

  it("stops when the viewer scrolls up, offers the jump button, and resumes from it", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scroll = stubScroll();
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    expect(document.querySelector(".jump")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    scrollGardenTo(100, scroll);
    expect(document.querySelector(".jump")?.textContent).toBe("Follow the growing tips");
    expect(document.querySelector(".jump")?.hasAttribute("data-follow")).toBe(true);
    const callsBefore = scroll.scrollTo.mock.calls.length;
    growTo(1200, scroll);
    rerender(<TimelineHarness {...timelineProps(session, { now: 29 })} />);
    expect(scroll.scrollTo).toHaveBeenCalledTimes(callsBefore);

    fireEvent.click(document.querySelector(".jump") as Element);
    expect(document.querySelector(".jump")).toBeNull();
    expect(scroll.scrollTo).toHaveBeenCalledTimes(callsBefore + 1);
    expect(scroll.scrollTo).toHaveBeenLastCalledWith({ top: 100 + (1200 - 100) - 520 + 24, behavior: "smooth" });
  });

  it("keeps following when the viewer stays at the edge", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scroll = stubScroll();
    const session = payloadSession("claude/live_blocked.json", 0);
    render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    scrollGardenTo(504, scroll);
    expect(document.querySelector(".jump")).toBeNull();
  });

  it("ignores scrolls made by its own scrollTo", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scroll = stubScroll();
    const session = payloadSession("claude/live_blocked.json", 0);
    render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    scrollGardenTo(100, scroll);
    expect(document.querySelector(".jump")).toBeNull();
  });

  it("does nothing while the tree is showing, and starts when the timeline is shown", async () => {
    const scroll = stubScroll();
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} view="tree" />);
    growTo(1100, scroll);
    rerender(<TimelineHarness {...timelineProps(session, { now: 29 })} view="tree" />);
    scrollGardenTo(100, scroll);
    expect(scroll.scrollTo).not.toHaveBeenCalled();
    expect(document.querySelector(".jump")).toBeNull();

    await showView("timeline", rerender, timelineProps(session, { now: 29 }));
    expect(scroll.scrollTo).toHaveBeenCalledTimes(1);
    expect(scroll.scrollTo).toHaveBeenLastCalledWith({ top: 100 + (1100 - 100) - 520 + 24, behavior: "smooth" });

    await showView("tree", rerender, timelineProps(session, { now: 29 }));
    growTo(1300, scroll);
    rerender(<TimelineHarness {...timelineProps(session, { now: 30 })} view="tree" />);
    expect(scroll.scrollTo).toHaveBeenCalledTimes(1);
  });

  it("pauses following when another row is selected, and resumes from the jump button", () => {
    const scroll = stubScroll();
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    expect(document.querySelector(".jump")).toBeNull();
    rerender(<TimelineHarness {...timelineProps(session, { now: 28, selectedId: 2 })} />);
    expect(document.querySelector(".jump")?.textContent).toBe("Follow the growing tips");
    const callsBefore = scroll.scrollTo.mock.calls.length;
    growTo(1200, scroll);
    rerender(<TimelineHarness {...timelineProps(session, { now: 29, selectedId: 2 })} />);
    expect(scroll.scrollTo).toHaveBeenCalledTimes(callsBefore);

    fireEvent.click(document.querySelector(".jump") as Element);
    expect(document.querySelector(".jump")).toBeNull();
    expect(scroll.scrollTo).toHaveBeenCalledTimes(callsBefore + 1);
    expect(scroll.scrollTo).toHaveBeenLastCalledWith({ top: 504 + (1200 - 504) - 520 + 24, behavior: "smooth" });
  });

  it("does not follow the Now row in the commit that changes the selection", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scroll = stubScroll();
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    const callsBefore = scroll.scrollTo.mock.calls.length;
    growTo(1300, scroll);
    rerender(<TimelineHarness {...timelineProps(session, { now: 29, selectedId: 2 })} />);
    expect(scroll.scrollTo).toHaveBeenCalledTimes(callsBefore);
    expect(document.querySelector(".jump")).not.toBeNull();
  });

  it("stops an auto scroll in flight where it is when a row is selected", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scroll = stubScroll();
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    const garden = scroll.garden();
    const callsBefore = scroll.scrollTo.mock.calls.length;
    rerender(<TimelineHarness {...timelineProps(session, { now: 28, selectedId: 2 })} />);
    expect(scroll.scrollTo).toHaveBeenCalledTimes(callsBefore + 1);
    expect(scroll.scrollTo).toHaveBeenLastCalledWith({ top: garden.scrollTop, behavior: "auto" });

    scrollGardenTo(garden.scrollTop, scroll);
    expect(document.querySelector(".jump")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    growTo(1300, scroll);
    rerender(<TimelineHarness {...timelineProps(session, { now: 29, selectedId: 2 })} />);
    expect(scroll.scrollTo).toHaveBeenCalledTimes(callsBefore + 1);
  });

  it("does not cancel anything when no auto scroll is in flight", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const scroll = stubScroll();
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    act(() => {
      vi.advanceTimersByTime(700);
    });
    const callsBefore = scroll.scrollTo.mock.calls.length;
    rerender(<TimelineHarness {...timelineProps(session, { now: 28, selectedId: 2 })} />);
    expect(scroll.scrollTo).toHaveBeenCalledTimes(callsBefore);
  });

  it("pauses again only when the selected id changes after the viewer resumed", () => {
    const scroll = stubScroll();
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    rerender(<TimelineHarness {...timelineProps(session, { now: 28, selectedId: 2 })} />);
    fireEvent.click(document.querySelector(".jump") as Element);
    expect(document.querySelector(".jump")).toBeNull();
    rerender(<TimelineHarness {...timelineProps(session, { now: 29, selectedId: 2 })} />);
    expect(document.querySelector(".jump")).toBeNull();
    rerender(<TimelineHarness {...timelineProps(session, { now: 29, selectedId: 3 })} />);
    expect(document.querySelector(".jump")).not.toBeNull();
    expect(scroll.scrollTo).toHaveBeenCalled();
  });

  it("keeps the follow state when the selection is cleared", () => {
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    rerender(<TimelineHarness {...timelineProps(session, { now: 28, selectedId: 2 })} />);
    expect(document.querySelector(".jump")).not.toBeNull();
    rerender(<TimelineHarness {...timelineProps(session, { now: 28, selectedId: null })} />);
    expect(document.querySelector(".jump")).not.toBeNull();
    fireEvent.click(document.querySelector(".jump") as Element);
    rerender(<TimelineHarness {...timelineProps(session, { now: 28, selectedId: 2 })} />);
    expect(document.querySelector(".jump")).not.toBeNull();
    fireEvent.click(document.querySelector(".jump") as Element);
    rerender(<TimelineHarness {...timelineProps(session, { now: 28, selectedId: null })} />);
    expect(document.querySelector(".jump")).toBeNull();
  });

  it("follows again in another session even when it opens with a selection", () => {
    const scroll = stubScroll();
    const first = payloadSession("claude/live_blocked.json", 0);
    const second = payloadSession("claude/finished.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(first, { now: 28 })} />);
    rerender(<TimelineHarness {...timelineProps(first, { now: 28, selectedId: 2 })} />);
    expect(document.querySelector(".jump")).not.toBeNull();
    const callsBefore = scroll.scrollTo.mock.calls.length;
    scroll.contentBottom = 1500;
    rerender(<TimelineHarness {...timelineProps(second, { now: 60, selectedId: 1 })} />);
    expect(document.querySelector(".jump")).toBeNull();
    expect(scroll.scrollTo).toHaveBeenCalledTimes(callsBefore + 1);
    scroll.contentBottom = 1800;
    rerender(<TimelineHarness {...timelineProps(second, { now: 61, selectedId: 1 })} />);
    expect(scroll.scrollTo).toHaveBeenCalledTimes(callsBefore + 2);
  });

  it("follows again when the timeline is shown, even if the selection changed with it", async () => {
    const scroll = stubScroll();
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    rerender(<TimelineHarness {...timelineProps(session, { now: 28, selectedId: 2 })} />);
    expect(document.querySelector(".jump")).not.toBeNull();
    await showView("tree", rerender, timelineProps(session, { now: 28, selectedId: 2 }));
    const callsBefore = scroll.scrollTo.mock.calls.length;
    await showView("timeline", rerender, timelineProps(session, { now: 28, selectedId: 3 }));
    expect(document.querySelector(".jump")).toBeNull();
    scroll.contentBottom = 1300;
    rerender(<TimelineHarness {...timelineProps(session, { now: 29, selectedId: 3 })} />);
    expect(scroll.scrollTo.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("does not pause following for a selection that changes while the tree is showing", async () => {
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} view="tree" />);
    rerender(<TimelineHarness {...timelineProps(session, { now: 28, selectedId: 2 })} view="tree" />);
    await showView("timeline", rerender, timelineProps(session, { now: 28, selectedId: 2 }));
    expect(document.querySelector(".jump")).toBeNull();
  });

  it("removes its listeners on unmount", async () => {
    const scroll = stubScroll();
    const session = payloadSession("claude/live_blocked.json", 0);
    const { unmount } = render(<TimelineHarness {...timelineProps(session, { now: 28 })} />);
    const garden = scroll.garden();
    const removed = vi.spyOn(garden, "removeEventListener");
    unmount();
    expect(removed).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});

describe("TimelineView motion while hidden, across sessions, and on cancelled pops", () => {
  const live = () => payloadSession("claude/live_blocked.json", 0);
  const withNine = () => payloadSession("claude/live_blocked.json", 0, (source) => withLateAgent(source, lateAgent(9, 29)));
  const withBlockedNine = () =>
    payloadSession("claude/live_blocked.json", 0, (source) =>
      withLateAgent(source, { ...lateAgent(9, 29), phases: [{ at: 29, state: "blocked", note: "stuck" }] }),
    );

  async function showView(
    view: View,
    rerender: (ui: ReactElement) => void,
    props: ViewProps,
  ): Promise<void> {
    await act(async () => {
      rerender(<TimelineHarness {...props} view={view} />);
    });
  }

  function cancelAnimation(element: Element): void {
    act(() => {
      element.dispatchEvent(new Event("animationcancel", { bubbles: true }));
    });
  }

  it("replays nothing for agents that appeared while the timeline was hidden", async () => {
    const { rerender } = render(<TimelineHarness {...timelineProps(live(), { now: 28 })} view="tree" />);
    await showView("tree", rerender, timelineProps(live(), { now: 28 }));
    rerender(<TimelineHarness {...timelineProps(withNine(), { now: 29 })} view="tree" />);
    expect(document.querySelectorAll("#stems .grow, #stems .pop")).toHaveLength(0);
    rerender(<TimelineHarness {...timelineProps(withNine(), { now: 29 })} view="timeline" />);
    await showView("timeline", rerender, timelineProps(withNine(), { now: 29 }));
    expect(agentGroup(9).querySelectorAll(".stem")).toHaveLength(2);
    expect(document.querySelectorAll("#stems .grow, #stems .pop")).toHaveLength(0);
  });

  it("clears pending draw-in when the view leaves the timeline", async () => {
    const { rerender } = render(<TimelineHarness {...timelineProps(live(), { now: 28 })} />);
    await showView("timeline", rerender, timelineProps(live(), { now: 28 }));
    rerender(<TimelineHarness {...timelineProps(withNine(), { now: 29 })} />);
    expect(document.querySelectorAll("#stems .grow")).toHaveLength(2);
    await showView("tree", rerender, timelineProps(withNine(), { now: 29 }));
    expect(document.querySelectorAll("#stems .grow, #stems .pop")).toHaveLength(0);
    await showView("timeline", rerender, timelineProps(withNine(), { now: 29 }));
    expect(document.querySelectorAll("#stems .grow, #stems .pop")).toHaveLength(0);
  });

  it("still grows a new agent once while the timeline is shown", async () => {
    const { rerender } = render(<TimelineHarness {...timelineProps(live(), { now: 28 })} />);
    await showView("timeline", rerender, timelineProps(live(), { now: 28 }));
    rerender(<TimelineHarness {...timelineProps(withNine(), { now: 29 })} />);
    expect([...document.querySelectorAll("#stems .grow")].map((path) => path.getAttribute("data-stem"))).toEqual([
      "f9",
      "v9",
    ]);
    expect(document.querySelectorAll("#stems .pop")).toHaveLength(1);
    document.querySelectorAll("#stems .grow").forEach((path) => finishAnimation(path, "timeline-grow"));
    finishAnimation(agentGroup(9).querySelector(".pop") as Element, "timeline-pop");
    rerender(<TimelineHarness {...timelineProps(withNine(), { now: 29, selectedId: 9 })} />);
    expect(document.querySelectorAll("#stems .grow, #stems .pop")).toHaveLength(0);
  });

  it("does not replay a pop when a state changes mid-pop and flips back", async () => {
    const { rerender } = render(<TimelineHarness {...timelineProps(live(), { now: 28 })} />);
    await showView("timeline", rerender, timelineProps(live(), { now: 28 }));
    rerender(<TimelineHarness {...timelineProps(withNine(), { now: 29 })} />);
    expect(agentGroup(9).querySelectorAll(".pop")).toHaveLength(1);
    rerender(<TimelineHarness {...timelineProps(withBlockedNine(), { now: 29 })} />);
    rerender(<TimelineHarness {...timelineProps(withNine(), { now: 29 })} />);
    expect(document.querySelectorAll("#stems .pop")).toHaveLength(0);
  });

  it("finishes a pop that is cancelled instead of ended", async () => {
    const { rerender } = render(<TimelineHarness {...timelineProps(live(), { now: 28 })} />);
    await showView("timeline", rerender, timelineProps(live(), { now: 28 }));
    rerender(<TimelineHarness {...timelineProps(withNine(), { now: 29 })} />);
    cancelAnimation(agentGroup(9).querySelector(".pop") as Element);
    expect(document.querySelectorAll("#stems .pop")).toHaveLength(0);
  });

  it("scrolls without animation first in a new session, then smoothly", () => {
    const scroll = stubScroll();
    const first = live();
    const second = payloadSession("claude/finished.json", 0);
    const { rerender } = render(<TimelineHarness {...timelineProps(first, { now: 28 })} />);
    scroll.contentBottom = 1200;
    rerender(<TimelineHarness {...timelineProps(first, { now: 29 })} />);
    expect(scroll.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "smooth" }));
    const callsBefore = scroll.scrollTo.mock.calls.length;
    scroll.contentBottom = 1500;
    rerender(<TimelineHarness {...timelineProps(second, { now: 60 })} />);
    expect(scroll.scrollTo.mock.calls).toHaveLength(callsBefore + 1);
    expect(scroll.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "auto" }));
    scroll.contentBottom = 1800;
    rerender(<TimelineHarness {...timelineProps(second, { now: 61 })} />);
    expect(scroll.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });
});
