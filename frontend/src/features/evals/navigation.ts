import { matchesQuery, REDUCED_MOTION_QUERY } from "@/hooks/mediaQuery";

function entryOf(caseId: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>(".eval-entry")).find((entry) => entry.dataset.caseId === caseId);
}

export function entryTriggers(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".eval-trigger, .eval-fold"));
}

export function revealEntry(caseId: string): void {
  const behavior = matchesQuery(REDUCED_MOTION_QUERY) ? "auto" : "smooth";
  entryOf(caseId)?.scrollIntoView?.({ block: "nearest", behavior });
}

export function focusTrigger(caseId: string): void {
  entryOf(caseId)?.querySelector<HTMLElement>(".eval-trigger")?.focus({ preventScroll: true });
}

export function focusMark(caseId: string, side: string, attempt: number): void {
  const marks = entryOf(caseId)?.querySelectorAll<HTMLElement>(".eval-mark") ?? [];
  Array.from(marks)
    .find((mark) => mark.dataset.side === side && mark.dataset.attempt === String(attempt))
    ?.focus({ preventScroll: true });
}
