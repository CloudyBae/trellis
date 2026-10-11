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

export type VerticalSpan = { top: number; bottom: number };

type RevealFit = {
  visibleHeight: number;
  root: VerticalSpan;
  target: VerticalSpan;
  marginTop: number;
  marginBottom: number;
};

const ROOT_ID = 1;
const DEFAULT_MARGIN_TOP = 64;
const DEFAULT_MARGIN_BOTTOM = 84;
const INLINE_MARGIN = 16;

export function fitsWithRoot({ visibleHeight, root, target, marginTop, marginBottom }: RevealFit): boolean {
  const top = Math.min(root.top, target.top) - marginTop;
  const bottom = Math.max(root.bottom, target.bottom) + marginBottom;
  return bottom - top <= visibleHeight;
}

function scrollContainerOf(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
    const { overflowY } = window.getComputedStyle(parent);
    if ((overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
  }
  return null;
}

function marginOf(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function revealInline(target: HTMLElement, behavior: ScrollBehavior): void {
  const flow = target.closest<HTMLElement>("#flow");
  if (flow === null || flow.scrollWidth <= flow.clientWidth) {
    return;
  }
  const flowBox = flow.getBoundingClientRect();
  const targetBox = target.getBoundingClientRect();
  const overLeft = targetBox.left - INLINE_MARGIN - flowBox.left;
  const overRight = targetBox.right + INLINE_MARGIN - flowBox.right;
  const shift = overLeft < 0 ? overLeft : overRight > 0 ? overRight : 0;
  if (shift !== 0) {
    flow.scrollTo?.({ left: Math.max(flow.scrollLeft + shift, 0), behavior });
  }
}

function revealWithRoot(target: HTMLElement, behavior: ScrollBehavior): boolean {
  const root = findAgentTarget("tree", ROOT_ID);
  const container = scrollContainerOf(target);
  if (root === null || container === null || root === target) {
    return false;
  }
  const style = window.getComputedStyle(target);
  const marginTop = marginOf(style.scrollMarginTop, DEFAULT_MARGIN_TOP);
  const marginBottom = marginOf(style.scrollMarginBottom, DEFAULT_MARGIN_BOTTOM);
  const rootBox = root.getBoundingClientRect();
  const targetBox = target.getBoundingClientRect();
  if (!fitsWithRoot({ visibleHeight: container.clientHeight, root: rootBox, target: targetBox, marginTop, marginBottom })) {
    return false;
  }
  const containerBox = container.getBoundingClientRect();
  const bothVisible =
    Math.min(rootBox.top, targetBox.top) - marginTop >= containerBox.top &&
    Math.max(rootBox.bottom, targetBox.bottom) + marginBottom <= containerBox.bottom;
  if (!bothVisible) {
    const top = container.scrollTop + rootBox.top - containerBox.top - marginTop;
    container.scrollTo?.({ top: Math.max(top, 0), behavior });
  }
  revealInline(target, behavior);
  return true;
}

export function revealAgentTarget(view: View, id: number): void {
  const target = findAgentTarget(view, id);
  if (target === null) {
    return;
  }
  const behavior = matchesQuery(REDUCED_MOTION_QUERY) ? "auto" : "smooth";
  if (view === "tree" && revealWithRoot(target, behavior)) {
    return;
  }
  target.scrollIntoView?.({ block: "nearest", behavior });
}
