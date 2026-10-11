import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/api";
import { plainName } from "@/model";
import { payloadSession } from "@/test/payloadSessions";
import { TreeHarness, nodeElement, nodeIds, treeProps } from "@/test/treeTestSupport";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "matchMedia");
});

describe("TreeView states", () => {
  it.each([
    ["claude/finished.json", 0, 60, [["complete"], ["complete"], ["failed"]]],
    ["claude/live_blocked.json", 0, 28, [["waiting"], ["running"], ["running"]]],
    ["claude/hooks_edge.json", 1, 60, [["blocked"], ["running"]]],
  ] as const)("renders %s in agent order with a class, glyph and label for each state", (file, snapshot, now, states) => {
    const session = payloadSession(file, snapshot);
    render(<TreeHarness {...treeProps(session, { now })} />);
    expect(nodeIds()).toEqual(session.agents.map((agent) => agent.id));
    states.forEach(([state], index) => {
      const node = nodeElement(index + 1);
      expect(node.classList.contains(`s-${state}`)).toBe(true);
      expect(node.querySelector(".state")?.textContent ?? "complete").toBe(state);
      expect(node.querySelector(".badge use")?.getAttribute("href")).toBe(`#g-${state}`);
    });
  });

  it("labels a node with its name, state and the task it was given", () => {
    const session = payloadSession("claude/live_blocked.json", 0);
    render(<TreeHarness {...treeProps(session, { now: 28 })} />);
    expect(nodeElement(1).getAttribute("aria-label")).toBe(
      "Orchestrator, waiting. Waiting on Explorer and Security reviewer to return.",
    );
    expect(nodeElement(2).getAttribute("aria-label")).toBe("Explorer, delegated by Orchestrator, running. Find token call sites");
    expect(nodeElement(2).querySelector(".nname")?.textContent).toBe("Explorer");
  });

  it("names the delegating parent in a child label and leaves the root label alone", () => {
    const session = payloadSession("codex/parent_variants.json");
    render(<TreeHarness {...treeProps(session)} />);
    const parent = session.agents.find((agent) => agent.id === 2);
    const grandchild = nodeElement(17).getAttribute("aria-label") ?? "";
    expect(grandchild).toContain(`delegated by ${parent === undefined ? "" : plainName(parent)}`);
    expect(nodeElement(2).getAttribute("aria-label")).toContain("delegated by Orchestrator");
    expect(nodeElement(1).getAttribute("aria-label")).not.toContain("delegated by");
  });

  it("shows the returned summary for a finished agent and marks the root with the wide label", () => {
    const session = payloadSession("claude/finished.json", 0);
    render(<TreeHarness {...treeProps(session, { now: 60 })} />);
    expect(nodeElement(2).querySelector(".nact")?.textContent).toBe("14 call sites across 6 files.");
    expect(nodeElement(1).classList.contains("root")).toBe(true);
    expect(nodeElement(2).classList.contains("root")).toBe(false);
  });

  it("draws nothing for an agent that has not started and adds it when it does", () => {
    const session = payloadSession("claude/finished.json", 0);
    const { rerender } = render(<TreeHarness {...treeProps(session, { now: 1 })} />);
    expect(nodeIds()).toEqual([1]);
    expect(document.querySelectorAll(".fstems .stem")).toHaveLength(0);
    rerender(<TreeHarness {...treeProps(session, { now: 6 })} />);
    expect(nodeIds()).toEqual([1, 2, 3]);
    expect(document.querySelectorAll(".fstems .stem")).toHaveLength(2);
  });

  it("draws a finished branch faded and a selected branch lit", () => {
    const session = payloadSession("claude/finished.json", 0);
    render(<TreeHarness {...treeProps(session, { now: 60, selectedId: 3 })} />);
    const groups = [...document.querySelectorAll(".fstems .a")];
    expect(groups.every((group) => group.classList.contains("done"))).toBe(true);
    expect(groups.filter((group) => group.classList.contains("lit"))).toHaveLength(1);
    expect(document.querySelector(".fstems")?.classList.contains("has-sel")).toBe(true);
  });
});

describe("TreeView selection", () => {
  it("marks the selected node and reports a click with focusPane", () => {
    const session = payloadSession("claude/finished.json", 0);
    const props = treeProps(session, { now: 60, selectedId: 2 });
    render(<TreeHarness {...props} />);
    expect(nodeElement(2).getAttribute("aria-current")).toBe("true");
    expect(nodeElement(3).hasAttribute("aria-current")).toBe(false);
    fireEvent.click(nodeElement(3));
    expect(props.onSelect).toHaveBeenCalledWith(3, { focusPane: true });
  });

  it("keeps focus on the same node when the run updates", () => {
    const session = payloadSession("claude/live_blocked.json", 0);
    const { rerender } = render(<TreeHarness {...treeProps(session, { now: 28 })} />);
    nodeElement(3).focus();
    rerender(<TreeHarness {...treeProps(session, { now: 29, selectedId: 3 })} />);
    expect(document.activeElement).toBe(nodeElement(3));
  });

  it("uses narrower columns when narrow", () => {
    const session = payloadSession("claude/finished.json", 0);
    const wide = render(<TreeHarness {...treeProps(session, { now: 60 })} />);
    expect(nodeElement(3).style.width).toBe("152px");
    wide.unmount();
    render(<TreeHarness {...treeProps(session, { now: 60, narrow: true })} />);
    expect(nodeElement(3).style.width).toBe("132px");
  });

  it("carries the view props the app shell reads", () => {
    const session = payloadSession("claude/finished.json", 0);
    render(<TreeHarness {...treeProps(session, { now: 60, selectedId: 2 })} />);
    const flow = document.getElementById("flow");
    expect(flow?.getAttribute("role")).toBe("group");
    expect(flow?.dataset.selectedId).toBe("2");
    expect(flow?.dataset.now).toBe("60");
    expect(flow?.dataset.narrow).toBe("false");
  });
});

describe("TreeView earlier-prompt fold", () => {
  function promptedSession(promptTimes: number[]) {
    const edit = (session: Session): Session => ({
      ...session,
      agents: session.agents.map((agent) =>
        agent.id === 1
          ? { ...agent, turns: promptTimes.map((at) => ({ at, kind: "user" as const, text: `prompt ${at}` })) }
          : { ...agent, start: 2, end: 10, final: "complete" as const },
      ),
    });
    return payloadSession("claude/finished.json", 0, edit);
  }

  it("folds again when a newer prompt arrives after the fold was opened", () => {
    const { rerender } = render(<TreeHarness {...treeProps(promptedSession([0, 20]), { now: 60 })} />);
    expect(nodeIds()).toEqual([1]);
    fireEvent.click(document.querySelector(".node.fold") as HTMLElement);
    expect(nodeIds()).toEqual([1, 2, 3]);
    rerender(<TreeHarness {...treeProps(promptedSession([0, 20]), { now: 70 })} />);
    expect(nodeIds()).toEqual([1, 2, 3]);
    rerender(<TreeHarness {...treeProps(promptedSession([0, 20, 65]), { now: 70 })} />);
    expect(nodeIds()).toEqual([1]);
  });
});

describe("TreeView label reserve", () => {
  function stubProbeHeights(node: number, root: number): void {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const height = this.closest(".nprobe") === null ? 0 : this.classList.contains("root") ? root : node;
      return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: height, width: 0, height, toJSON: () => ({}) };
    });
  }

  function rowGap(): number {
    const session = payloadSession("codex/parent_variants.json");
    render(<TreeHarness {...treeProps(session)} />);
    return Number.parseFloat(nodeElement(17).style.top) - Number.parseFloat(nodeElement(2).style.top);
  }

  it("spaces rows by the default reserve before anything is measured", () => {
    expect(rowGap()).toBe(288);
  });

  it("spaces rows by the measured probe height without drawing the probe as a node", () => {
    stubProbeHeights(220, 130);
    expect(rowGap()).toBe(220 + 80);
    expect(document.querySelector(".nprobe")?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelectorAll(".nprobe [data-fid]")).toHaveLength(0);
  });
});
