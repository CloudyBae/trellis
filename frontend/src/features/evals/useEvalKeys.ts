import { useEffect } from "react";
import type { EvalExperiment } from "@/model";
import { defaultTrial, nextRegression } from "@/lib/evals";
import type { EvalFocus } from "@/lib/evals";
import { useLatest } from "@/hooks/useLatest";
import { entryTriggers, focusMark, focusTrigger, revealEntry } from "./navigation";

type EvalKeyContext = {
  experiment: EvalExperiment;
  focus: EvalFocus | null;
  onSelect: (focus: EvalFocus) => void;
  onClose: () => void;
};

const MOVE_KEYS = ["ArrowDown", "ArrowUp", "j", "k"];
const ATTEMPT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const TYPING_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (TYPING_TAGS.includes(target.tagName) || target.isContentEditable);
}

function currentIndex(triggers: HTMLElement[], focus: EvalFocus | null): number {
  const active = document.activeElement;
  const focused = triggers.findIndex((trigger) => trigger === active || trigger.closest(".eval-entry")?.contains(active) === true);
  if (focused !== -1) {
    return focused;
  }
  return triggers.findIndex((trigger) => focus !== null && trigger.closest<HTMLElement>(".eval-entry")?.dataset.caseId === focus.caseId);
}

function moveBetweenEntries(context: EvalKeyContext, event: KeyboardEvent): void {
  const triggers = entryTriggers();
  const forward = event.key === "ArrowDown" || event.key === "j";
  const from = currentIndex(triggers, context.focus);
  const start = from === -1 ? (forward ? -1 : triggers.length) : from;
  const target = triggers[Math.min(Math.max(start + (forward ? 1 : -1), 0), triggers.length - 1)];
  if (target !== undefined) {
    event.preventDefault();
    target.focus();
  }
}

function pickAttempt(context: EvalKeyContext, event: KeyboardEvent): void {
  const { experiment, focus } = context;
  const evalCase = experiment.cases.find((item) => item.id === focus?.caseId);
  const attempt = Number(event.key);
  if (focus === null || evalCase === undefined || !evalCase[focus.side].some((trial) => trial.attempt === attempt)) {
    return;
  }
  event.preventDefault();
  context.onSelect({ ...focus, attempt });
  focusMark(focus.caseId, focus.side, attempt);
}

function openNextRegression(context: EvalKeyContext, event: KeyboardEvent): void {
  const target = nextRegression(context.experiment, context.focus?.caseId ?? null);
  const next = target === null ? null : defaultTrial(target);
  if (next === null) {
    return;
  }
  event.preventDefault();
  context.onSelect(next);
  focusTrigger(next.caseId);
  revealEntry(next.caseId);
}

export function handleEvalKey(event: KeyboardEvent, context: EvalKeyContext): void {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || isTyping(event.target)) {
    return;
  }
  if (event.key === "Escape") {
    if (context.focus !== null) {
      const { caseId } = context.focus;
      event.preventDefault();
      context.onClose();
      focusTrigger(caseId);
    }
  } else if (event.key === "n") {
    openNextRegression(context, event);
  } else if (ATTEMPT_KEYS.includes(event.key)) {
    pickAttempt(context, event);
  } else if (MOVE_KEYS.includes(event.key)) {
    moveBetweenEntries(context, event);
  }
}

export function useEvalKeys(context: EvalKeyContext): void {
  const latest = useLatest(context);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleEvalKey(event, latest.current);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [latest]);
}
