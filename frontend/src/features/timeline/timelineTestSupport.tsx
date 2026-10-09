import { act } from "@testing-library/react";
import { vi } from "vitest";
import type { Agent, Session } from "@/api";
import type { ViewProps } from "@/lib/viewProps";
import type { ModelSession } from "@/model";
import type { View } from "@/lib/view";
import { TimelineView } from "./TimelineView";

export function timelineProps(session: ModelSession, overrides: Partial<ViewProps> = {}): ViewProps {
  return { session, selectedId: null, now: session.endAt, narrow: false, onSelect: vi.fn(), ...overrides };
}

export function TimelineHarness({ view = "timeline", ...props }: ViewProps & { view?: View }) {
  return (
    <main className="garden" id="garden" data-view={view}>
      <TimelineView {...props} view={view} />
      <footer className="legend">Legend</footer>
    </main>
  );
}

export function lateAgent(id: number, start: number): Agent {
  return {
    id,
    name: `Late ${id}`,
    src: "Claude Code",
    start,
    task: `late task ${id}`,
    parent: 1,
    context: [],
    turns: [],
    completeness: "complete",
  };
}

export function withLateAgent(session: Session, agent: Agent): Session {
  return { ...session, agents: [...session.agents, agent] };
}

export function rowKeys(): string[] {
  return [...document.querySelectorAll<HTMLElement>("#rows [data-key]")].map((row) => row.dataset["key"] ?? "");
}

export function rowTops(): Record<string, string> {
  const tops: Record<string, string> = {};
  document.querySelectorAll<HTMLElement>("#rows [data-key]").forEach((row) => {
    tops[row.dataset["key"] ?? ""] = row.style.top;
  });
  return tops;
}

export function queueAnimationFrames(): { flush: () => void; scheduled: () => number } {
  const queue: FrameRequestCallback[] = [];
  let total = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    queue.push(callback);
    total++;
    return total;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  return {
    flush: () => {
      act(() => {
        while (queue.length > 0) {
          queue.shift()?.(0);
        }
      });
    },
    scheduled: () => total,
  };
}

export type StubbedScroll = {
  gardenBottom: number;
  contentBottom: number;
  legendHeight: number;
  legendPosition: "sticky" | "static";
  scrollTo: ReturnType<typeof vi.fn>;
  garden: () => HTMLElement;
};

const ORIGINAL_SCROLL_TOP = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop");

export function restoreScroll(): void {
  vi.restoreAllMocks();
  Reflect.deleteProperty(Element.prototype, "scrollTo");
  if (ORIGINAL_SCROLL_TOP !== undefined) {
    Object.defineProperty(Element.prototype, "scrollTop", ORIGINAL_SCROLL_TOP);
  }
}

export function stubScroll(initial: Partial<StubbedScroll> = {}): StubbedScroll {
  const state: StubbedScroll = {
    gardenBottom: 600,
    contentBottom: 1000,
    legendHeight: 80,
    legendPosition: "sticky",
    scrollTo: vi.fn(),
    garden: () => {
      const element = document.querySelector<HTMLElement>(".garden");
      if (element === null) {
        throw new Error("No garden");
      }
      return element;
    },
    ...initial,
  };
  const scrollTops = new WeakMap<Element, number>();
  Object.defineProperty(Element.prototype, "scrollTop", {
    configurable: true,
    get(this: Element) {
      return scrollTops.get(this) ?? 0;
    },
    set(this: Element, value: number) {
      scrollTops.set(this, value);
    },
  });
  state.scrollTo.mockImplementation(function (this: Element, options: ScrollToOptions) {
    scrollTops.set(this, options.top ?? 0);
  });
  Element.prototype.scrollTo = state.scrollTo as unknown as typeof Element.prototype.scrollTo;
  const rectWithBottom = (bottom: number): DOMRect => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 0,
    width: 0,
    height: 0,
    bottom,
    toJSON: () => ({}),
  });
  const original = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.classList.contains("garden")) {
      return rectWithBottom(state.gardenBottom);
    }
    if (this.classList.contains("nowrow")) {
      return rectWithBottom(state.contentBottom - (scrollTops.get(state.garden()) ?? 0));
    }
    return original.call(this);
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.classList.contains("legend") ? state.legendHeight : 0;
  });
  const originalComputed = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element: Element, pseudo?: string | null) => {
    const style = originalComputed(element, pseudo);
    if (element.classList.contains("legend")) {
      return { position: state.legendPosition } as CSSStyleDeclaration;
    }
    return style;
  });
  return state;
}

export function scrollGardenTo(position: number, state: StubbedScroll): void {
  const garden = state.garden();
  garden.scrollTop = position;
  act(() => {
    garden.dispatchEvent(new Event("scroll"));
  });
}
