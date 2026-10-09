import type { View } from "@/lib/view";
import { matchesQuery, REDUCED_MOTION_QUERY } from "@/hooks/mediaQuery";

function selectorFor(view: View, id: number): string {
  return view === "tree" ? `[data-fid="${id}"]` : `[data-key="${id}spawn"]`;
}

export function findAgentTarget(view: View, id: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(selectorFor(view, id));
}

export function firstAgentTarget(view: View): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    view === "tree" ? "#flow [data-fid]" : '#rows [data-key$="spawn"]',
  );
}

export function focusAgentTarget(view: View, id: number): void {
  findAgentTarget(view, id)?.focus({ preventScroll: true });
}

export function revealAgentTarget(view: View, id: number): void {
  findAgentTarget(view, id)?.scrollIntoView?.({
    block: "nearest",
    behavior: matchesQuery(REDUCED_MOTION_QUERY) ? "auto" : "smooth",
  });
}
