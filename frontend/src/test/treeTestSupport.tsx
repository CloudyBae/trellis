import { act } from "@testing-library/react";
import { vi } from "vitest";
import type { ViewProps } from "@/lib/viewProps";
import type { ModelSession } from "@/model";
import type { View } from "@/lib/view";
import { TreeView } from "@/features/tree/TreeView";

export function treeProps(session: ModelSession, overrides: Partial<ViewProps> = {}): ViewProps {
  return { session, selectedId: null, now: session.endAt, narrow: false, onSelect: vi.fn(), ...overrides };
}

export function TreeHarness({ view = "tree", ...props }: ViewProps & { view?: View }) {
  return (
    <main className="garden" id="garden" data-view={view}>
      <TreeView {...props} />
    </main>
  );
}

export function nodeElement(id: number): HTMLElement {
  const element = document.querySelector<HTMLElement>(`#flow [data-fid="${id}"]`);
  if (element === null) {
    throw new Error(`No node ${id}`);
  }
  return element;
}

export function nodeIds(): number[] {
  return [...document.querySelectorAll<HTMLElement>("#flow [data-fid]")].map((element) => Number(element.dataset.fid));
}

export function stubReducedMotion(reduced: boolean): void {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

export function finishAnimation(element: Element, animationName: string): void {
  const type = "AnimationEvent" in window ? "animationend" : "webkitAnimationEnd";
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, "animationName", { value: animationName });
  act(() => {
    element.dispatchEvent(event);
  });
}
