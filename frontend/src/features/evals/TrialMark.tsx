import type { MouseEvent } from "react";
import { assertNever } from "@/model";
import type { EvalSide, EvalTrial, EvalVerdict } from "@/model";
import { verdictReason, verdictWords } from "@/lib/evals";

type TrialMarkProps = {
  side: EvalSide;
  trial: EvalTrial;
  selected: boolean;
  onSelect: () => void;
};

export function markName(side: EvalSide, trial: EvalTrial): string {
  return `Trial ${trial.attempt}, ${side}: ${verdictWords(trial.verdict)}`;
}

function markTitle(side: EvalSide, trial: EvalTrial): string {
  const reason = verdictReason(trial.verdict);
  const name = markName(side, trial);
  return reason !== null && trial.verdict.kind !== "fail" ? `${name}: ${reason}` : name;
}

function Shape({ verdict }: { verdict: EvalVerdict }) {
  switch (verdict.kind) {
    case "pass":
      return <circle cx="7" cy="7" r="5.2" fill="var(--ink)" />;
    case "fail":
      return (
        <path
          d="M3.2 3.2 10.8 10.8M10.8 3.2 3.2 10.8"
          fill="none"
          stroke="var(--rose-ink)"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      );
    case "unknown":
      return <circle cx="7" cy="7" r="4.6" fill="none" stroke="var(--ink-3)" strokeWidth="1.6" />;
    case "not-eligible":
      return (
        <circle
          cx="7"
          cy="7"
          r="4.6"
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth="1.6"
          strokeDasharray="2.2 2"
        />
      );
    case "running":
      return <circle className="eval-running-dot" cx="7" cy="7" r="2.5" fill="none" stroke="var(--ink-3)" strokeWidth="1.6" />;
    default:
      return assertNever(verdict);
  }
}

export function MarkIcon({ verdict }: { verdict: EvalVerdict }) {
  return (
    <svg className="eval-mark-icon" viewBox="0 0 14 14" aria-hidden="true">
      <Shape verdict={verdict} />
    </svg>
  );
}

export function TrialMark({ side, trial, selected, onSelect }: TrialMarkProps) {
  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    onSelect();
  }

  return (
    <button
      type="button"
      className="eval-mark"
      aria-label={markName(side, trial)}
      aria-pressed={selected}
      title={markTitle(side, trial)}
      data-side={side}
      data-attempt={trial.attempt}
      onClick={handleClick}
    >
      <span className="eval-mark-face">
        <MarkIcon verdict={trial.verdict} />
      </span>
    </button>
  );
}

export function StaticMark({ verdict }: { verdict: EvalVerdict }) {
  return (
    <span className="eval-mark">
      <span className="eval-mark-face">
        <MarkIcon verdict={verdict} />
      </span>
    </span>
  );
}
