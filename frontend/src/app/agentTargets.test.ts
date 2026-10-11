import { afterEach, describe, expect, it, vi } from "vitest";
import { fitsWithRoot, revealAgentTarget } from "./agentTargets";

const MARGINS = { marginTop: 64, marginBottom: 84 };

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("fitsWithRoot", () => {
  it("fits when the root top margin through the target bottom margin is within the visible height", () => {
    expect(
      fitsWithRoot({ visibleHeight: 600, root: { top: 100, bottom: 160 }, target: { top: 300, bottom: 450 }, ...MARGINS }),
    ).toBe(true);
  });

  it("does not fit when the span with both scroll margins exceeds the visible height", () => {
    expect(
      fitsWithRoot({ visibleHeight: 480, root: { top: 100, bottom: 160 }, target: { top: 300, bottom: 450 }, ...MARGINS }),
    ).toBe(false);
  });

  it("counts the margins at the boundary", () => {
    const span = { root: { top: 0, bottom: 50 }, target: { top: 100, bottom: 200 } };
    expect(fitsWithRoot({ visibleHeight: 348, ...span, ...MARGINS })).toBe(true);
    expect(fitsWithRoot({ visibleHeight: 347, ...span, ...MARGINS })).toBe(false);
  });
});

describe("revealAgentTarget in the tree", () => {
  function mountTree(containerHeight: number, targetBottom: number) {
    document.body.innerHTML =
      '<div id="garden"><div id="flow"><button data-fid="1"></button><button data-fid="3"></button></div></div>';
    const garden = document.getElementById("garden") as HTMLElement;
    const root = document.querySelector<HTMLElement>('[data-fid="1"]') as HTMLElement;
    const target = document.querySelector<HTMLElement>('[data-fid="3"]') as HTMLElement;
    garden.style.overflowY = "auto";
    target.style.scrollMarginTop = "64px";
    target.style.scrollMarginBottom = "84px";
    Object.defineProperty(garden, "clientHeight", { configurable: true, value: containerHeight });
    Object.defineProperty(garden, "scrollHeight", { configurable: true, value: containerHeight * 3 });
    garden.scrollTop = 500;
    garden.getBoundingClientRect = () => ({ top: 0, bottom: containerHeight }) as DOMRect;
    root.getBoundingClientRect = () => ({ top: -200, bottom: -140 }) as DOMRect;
    target.getBoundingClientRect = () => ({ top: targetBottom - 120, bottom: targetBottom }) as DOMRect;
    const scrollTo = vi.fn();
    garden.scrollTo = scrollTo;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    return { scrollTo, scrollIntoView };
  }

  it("scrolls the root's top margin to the top when the root and target fit together", () => {
    const { scrollTo, scrollIntoView } = mountTree(700, 150);
    revealAgentTarget("tree", 3);
    expect(scrollTo).toHaveBeenCalledWith({ top: 500 - 200 - 64, behavior: "smooth" });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("falls back to the nearest block when they do not fit together", () => {
    const { scrollTo, scrollIntoView } = mountTree(300, 150);
    revealAgentTarget("tree", 3);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });

  it("does not scroll vertically when the root and target are already in view", () => {
    const { scrollTo, scrollIntoView } = mountTree(700, 300);
    const root = document.querySelector<HTMLElement>('[data-fid="1"]') as HTMLElement;
    root.getBoundingClientRect = () => ({ top: 80, bottom: 140 }) as DOMRect;
    revealAgentTarget("tree", 3);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("pans the tree sideways when the target sits past the right edge of a wide branch", () => {
    mountTree(700, 150);
    const flow = document.getElementById("flow") as HTMLElement;
    const target = document.querySelector<HTMLElement>('[data-fid="3"]') as HTMLElement;
    Object.defineProperty(flow, "clientWidth", { configurable: true, value: 360 });
    Object.defineProperty(flow, "scrollWidth", { configurable: true, value: 560 });
    flow.scrollLeft = 0;
    flow.getBoundingClientRect = () => ({ left: 0, right: 360 }) as DOMRect;
    target.getBoundingClientRect = () => ({ top: 30, bottom: 150, left: 400, right: 532 }) as DOMRect;
    const panTo = vi.fn();
    flow.scrollTo = panTo;
    revealAgentTarget("tree", 3);
    expect(panTo).toHaveBeenCalledWith({ left: 532 + 16 - 360, behavior: "smooth" });
  });

  it("leaves the timeline on the nearest block", () => {
    document.body.innerHTML = '<div id="rows"><div data-key="3spawn"></div></div>';
    const target = document.querySelector<HTMLElement>('[data-key="3spawn"]') as HTMLElement;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    revealAgentTarget("timeline", 3);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });
  });
});
