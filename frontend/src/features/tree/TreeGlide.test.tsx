import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentOf } from "../../model/agentFixtures";
import { payloadSession, withAgents } from "@/test/payloadSessions";
import { TreeHarness, finishAnimation, nodeElement, nodeIds, stubReducedMotion, treeProps } from "@/test/treeTestSupport";

let flowWidth = 1200;
let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;
let requested = 0;

function flushFrames(): void {
  act(() => {
    while (frames.size > 0) {
      const pending = [...frames.values()];
      frames = new Map();
      pending.forEach((callback) => callback(0));
    }
  });
}

beforeEach(() => {
  flowWidth = 1200;
  frames = new Map();
  nextFrame = 1;
  requested = 0;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("CSS", { supports: () => true });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    requested += 1;
    frames.set(nextFrame, callback);
    return nextFrame++;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    frames.delete(handle);
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => flowWidth });
  stubReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  Reflect.deleteProperty(window, "matchMedia");
});

const grandchildren = [
  agentOf(4, { name: "Reader", parent: 2, start: 61, task: "read" }),
  agentOf(5, { name: "Writer", parent: 2, start: 61, task: "write" }),
];

function before() {
  return payloadSession("claude/appended.json", 4);
}

function after() {
  return payloadSession("claude/appended.json", 4, (session) => withAgents(session, grandchildren), 2);
}

function left(id: number): number {
  return Number.parseFloat(nodeElement(id).style.left);
}

function stemOf(id: number): SVGPathElement {
  const childIds = nodeIds().filter((identifier) => identifier !== 1);
  const stem = document.querySelectorAll<SVGPathElement>(".fstems .stem")[childIds.indexOf(id)];
  if (stem === undefined) {
    throw new Error(`No stem for ${id}`);
  }
  return stem;
}

describe("the glide", () => {
  it("animates nothing on the first render", () => {
    render(<TreeHarness {...treeProps(before(), { now: 60 })} />);
    expect(requested).toBe(0);
    expect(document.querySelector(".grow")).toBeNull();
    expect(document.querySelector(".pop")).toBeNull();
    expect(document.querySelector(".moving")).toBeNull();
  });

  it("draws a moved node where it was, then moves it after two frames, and clears the moving mark after 680 ms", () => {
    const { rerender } = render(<TreeHarness {...treeProps(before(), { now: 60 })} />);
    const startLeft = left(3);
    const startPath = stemOf(3).getAttribute("d");
    rerender(<TreeHarness {...treeProps(after(), { now: 62 })} />);
    expect(left(3)).toBe(startLeft);
    expect(stemOf(3).getAttribute("d")).toBe(startPath);
    expect(document.querySelector(".fstems.moving")).not.toBeNull();
    expect(frames.size).toBe(1);

    act(() => {
      [...frames.values()][0]?.(0);
    });
    expect(left(3)).toBe(startLeft);
    flushFrames();
    expect(left(3)).toBeGreaterThan(startLeft);
    expect(stemOf(3).getAttribute("d")).not.toBe(startPath);

    expect(document.querySelector(".fstems.moving")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(680);
    });
    expect(document.querySelector(".fstems.moving")).toBeNull();
  });

  it("grows the edge and pops the pod of a new agent only, and stops when the animations end", () => {
    const { rerender } = render(<TreeHarness {...treeProps(before(), { now: 60 })} />);
    rerender(<TreeHarness {...treeProps(after(), { now: 62 })} />);
    expect(document.querySelectorAll(".fstems .grow")).toHaveLength(2);
    expect([...document.querySelectorAll("#flow .node.pop")].map((element) => element.getAttribute("data-fid"))).toEqual([
      "4",
      "5",
    ]);

    const stem = document.querySelector(".fstems .grow") as Element;
    finishAnimation(stem, "grow");
    expect(document.querySelectorAll(".fstems .grow")).toHaveLength(1);

    const pod = nodeElement(4).querySelector(".pod") as Element;
    finishAnimation(pod, "breathe-ring");
    expect(nodeElement(4).classList.contains("pop")).toBe(true);
    finishAnimation(pod, "pop");
    expect(nodeElement(4).classList.contains("pop")).toBe(false);
    expect(nodeElement(5).classList.contains("pop")).toBe(true);

    flushFrames();
    rerender(<TreeHarness {...treeProps(after(), { now: 63 })} />);
    expect(nodeElement(4).classList.contains("pop")).toBe(false);
  });

  it("fades a branch to done a frame after it first returns", () => {
    const running = payloadSession("claude/live_blocked.json", 0);
    const finished = payloadSession("claude/live_blocked.json", 5);
    const { rerender } = render(<TreeHarness {...treeProps(running, { now: 28 })} />);
    expect([...document.querySelectorAll(".fstems .a.done")]).toHaveLength(0);
    rerender(<TreeHarness {...treeProps(finished, { now: 28 })} />);
    expect([...document.querySelectorAll(".fstems .a.done")]).toHaveLength(0);
    flushFrames();
    expect([...document.querySelectorAll(".fstems .a.done")]).toHaveLength(2);
  });

  it("recolors a pod from its previous state, then to the new one", () => {
    const running = payloadSession("claude/live_blocked.json", 0);
    const finished = payloadSession("claude/live_blocked.json", 5);
    const { rerender } = render(<TreeHarness {...treeProps(running, { now: 28 })} />);
    expect(nodeElement(2).classList.contains("s-running")).toBe(true);
    rerender(<TreeHarness {...treeProps(finished, { now: 28 })} />);
    expect(nodeElement(2).classList.contains("s-running")).toBe(true);
    expect(nodeElement(2).querySelector(".state")).toBeNull();
    flushFrames();
    expect(nodeElement(2).classList.contains("s-complete")).toBe(true);
  });

  it("starts over when another run is opened", () => {
    const { rerender } = render(<TreeHarness {...treeProps(before(), { now: 60 })} />);
    const other = payloadSession("codex/subagent_tree.json", 0);
    rerender(<TreeHarness {...treeProps(other, { now: other.endAt })} />);
    expect(requested).toBe(0);
    expect(document.querySelector(".grow")).toBeNull();
    expect(document.querySelector(".pop")).toBeNull();
  });

  it("moves nodes straight to their place, without a glide, when the flow is resized", () => {
    const session = before();
    const { rerender } = render(<TreeHarness {...treeProps(session, { now: 60 })} />);
    const startTop = nodeElement(3).style.top;
    flowWidth = 300;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(nodeElement(3).style.top).not.toBe(startTop);
    expect(document.querySelector(".fstems.moving")).toBeNull();
    expect(document.getElementById("flow")?.classList.contains("instant")).toBe(true);
    flushFrames();
    expect(document.getElementById("flow")?.classList.contains("instant")).toBe(false);
    rerender(<TreeHarness {...treeProps(session, { now: 61 })} />);
    expect(document.querySelector(".grow")).toBeNull();
  });
});

describe("the glide edge cases", () => {
  it("jumps nodes and edges together, without holding anything, when the browser cannot animate paths", () => {
    vi.stubGlobal("CSS", { supports: () => false });
    const { rerender } = render(<TreeHarness {...treeProps(before(), { now: 60 })} />);
    const startLeft = left(3);
    rerender(<TreeHarness {...treeProps(after(), { now: 62 })} />);
    expect(left(3)).toBeGreaterThan(startLeft);
    expect(document.getElementById("flow")?.classList.contains("instant")).toBe(true);
    expect(document.querySelector(".fstems.moving")).toBeNull();
    flushFrames();
    expect(document.getElementById("flow")?.classList.contains("instant")).toBe(false);
  });

  it("does not replay grow or pop for agents that arrived while the flow was hidden", () => {
    const { rerender } = render(<TreeHarness {...treeProps(before(), { now: 60 })} />);
    flowWidth = 0;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    rerender(<TreeHarness {...treeProps(after(), { now: 62 })} />);
    flowWidth = 1200;
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    flushFrames();
    expect(nodeElement(4)).toBeTruthy();
    expect(document.querySelector(".grow")).toBeNull();
    expect(document.querySelector(".pop")).toBeNull();
  });
});

describe("the glide under reduced motion", () => {
  it("schedules no animated move: nodes and edges go straight to their place", () => {
    stubReducedMotion(true);
    const { rerender } = render(<TreeHarness {...treeProps(before(), { now: 60 })} />);
    const startLeft = left(3);
    const startPath = stemOf(3).getAttribute("d");
    rerender(<TreeHarness {...treeProps(after(), { now: 62 })} />);
    expect(requested).toBe(0);
    expect(left(3)).toBeGreaterThan(startLeft);
    expect(stemOf(3).getAttribute("d")).not.toBe(startPath);
    expect(document.querySelector(".moving")).toBeNull();
    expect(document.querySelector(".grow")).toBeNull();
    expect(document.querySelector(".pop")).toBeNull();
  });
});
