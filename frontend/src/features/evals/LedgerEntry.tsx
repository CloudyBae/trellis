import { assertNever } from "@/model";
import type { EvalCase, EvalSide, EvalTrial } from "@/model";
import {
  caseChange,
  changeWords,
  entryReason,
  graderMethodWords,
  lowerFirst,
  verdictReason,
  verdictWords,
} from "@/lib/evals";
import type { CaseChange, EvalFocus } from "@/lib/evals";
import { StaticMark, TrialMark } from "./TrialMark";
import "./evals.css";

type LedgerEntryProps = {
  evalCase: EvalCase;
  open: boolean;
  focus: EvalFocus | null;
  onOpen: (caseId: string) => void;
  onClose: () => void;
  onSelectTrial: (focus: EvalFocus) => void;
};

const SIDES: EvalSide[] = ["baseline", "candidate"];

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function caption(evalCase: EvalCase, change: CaseChange, reason: string | null, open: boolean): string {
  const method = graderMethodWords(evalCase.graderMethod);
  if (open) {
    return `${evalCase.capability} · ${method}`;
  }
  if (change.kind === "not-comparable") {
    return reason ?? "";
  }
  return `${evalCase.capability} · ${reason === null ? method : lowerFirst(reason)}`;
}

function closedWord(change: CaseChange): string | null {
  switch (change.kind) {
    case "fewer":
    case "more":
    case "same":
    case "running":
      return changeWords(change);
    case "not-comparable":
      return null;
    default:
      return assertNever(change);
  }
}

function openWord(change: CaseChange, trial: EvalTrial | undefined, side: EvalSide | undefined): string {
  if (trial === undefined || side === undefined) {
    return changeWords(change);
  }
  const reason = verdictReason(trial.verdict);
  const detail = `${side} trial ${trial.attempt} ${verdictWords(trial.verdict)}${reason === null ? "" : `: ${lowerFirst(reason)}`}`;
  return `${changeWords(change)} \u00b7 ${detail}`;
}

function summary(evalCase: EvalCase): string {
  return SIDES.map(
    (side) => `${capitalized(side)}: ${evalCase[side].map((trial) => verdictWords(trial.verdict)).join(", ")}.`,
  ).join(" ");
}

type EntryMarksProps = { evalCase: EvalCase; side: EvalSide; open: boolean; focus: EvalFocus | null; onSelectTrial: (focus: EvalFocus) => void };

function EntryMarks({ evalCase, side, open, focus, onSelectTrial }: EntryMarksProps) {
  if (!open) {
    return (
      <span className="eval-marks" aria-hidden="true">
        {evalCase[side].map((trial) => (
          <StaticMark key={trial.attempt} verdict={trial.verdict} />
        ))}
      </span>
    );
  }
  return (
    <div className="eval-marks" role="group" aria-label={`${evalCase.title}, ${side} trials`}>
      {evalCase[side].map((trial) => (
        <TrialMark
          key={trial.attempt}
          side={side}
          trial={trial}
          selected={focus?.side === side && focus.attempt === trial.attempt}
          onSelect={() => onSelectTrial({ caseId: evalCase.id, side, attempt: trial.attempt })}
        />
      ))}
    </div>
  );
}

function Delivered({ trial, side }: { trial: EvalTrial; side: EvalSide }) {
  const reason = verdictReason(trial.verdict);
  return (
    <div className="eval-rail">
      <div className="eval-from">{`Delivered · ${side} trial ${trial.attempt}`}</div>
      {trial.delivered !== undefined ? (
        <>
          <blockquote>{trial.delivered.excerpt}</blockquote>
          {trial.delivered.citations.length > 0 ? (
            <div className="eval-chips">
              {trial.delivered.citations.map((citation) => (
                <span className="eval-chip" key={citation}>
                  {citation}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ) : reason !== null ? (
        <blockquote>{reason}</blockquote>
      ) : (
        <p className="eval-muted">Nothing delivered for this trial.</p>
      )}
    </div>
  );
}

function Detail({ evalCase, trial, side, id }: { evalCase: EvalCase; trial: EvalTrial; side: EvalSide; id: string }) {
  return (
    <div className="eval-detail" id={id}>
      <div className="eval-diff">
        <div className="eval-rail">
          <div className="eval-from">Expected · public requirement</div>
          <blockquote>{evalCase.requirement.text}</blockquote>
          <div className="eval-chips">
            <span className="eval-chip">{evalCase.requirement.source}</span>
          </div>
        </div>
        <Delivered trial={trial} side={side} />
      </div>
      <dl className="eval-facts">
        <div>
          <dt>Checks</dt>
          <dd>
            <ul className="eval-list">
              {trial.checks.map((check, index) => (
                <li key={`${index}:${check.grader}`}>
                  <span className="eval-mono">{check.grader}</span> <span className="eval-chip">{check.version}</span> {check.method} ·{" "}
                  {check.outcome === undefined ? null : (
                    <>
                      <span className={check.outcome === "fail" ? "eval-result failed" : "eval-result"}>
                        {check.outcome === "fail" ? "failed" : "passed"}
                      </span>{" "}
                      ·{" "}
                    </>
                  )}
                  {check.result}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        {trial.regrades.length > 0 ? (
          <div>
            <dt>Regrades</dt>
            <dd>
              <ol className="eval-list">
                {trial.regrades.map((regrade, index) => (
                  <li key={`${index}:${regrade.version}`} title={regrade.at}>
                    <span className="eval-mono">{regrade.version}</span> · {regrade.verdict} · {regrade.at.split(" ")[0]}
                  </li>
                ))}
              </ol>
            </dd>
          </div>
        ) : null}
        {trial.missing.length > 0 ? (
          <div>
            <dt>Missing data</dt>
            <dd>
              <ul className="eval-list">
                {trial.missing.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function LedgerEntry({ evalCase, open, focus, onOpen, onClose, onSelectTrial }: LedgerEntryProps) {
  const change = caseChange(evalCase);
  const reason = entryReason(evalCase);
  const trial = open && focus !== null ? evalCase[focus.side].find((item) => item.attempt === focus.attempt) : undefined;
  const word = trial === undefined ? closedWord(change) : openWord(change, trial, focus?.side);
  const failedTrial = trial?.verdict.kind === "fail";
  const detailId = `eval-detail-${evalCase.id}`;
  const wordId = `eval-word-${evalCase.id}`;

  return (
    <article
      className={open ? "eval-entry open" : "eval-entry"}
      data-case-id={evalCase.id}
      onClick={open ? undefined : () => onOpen(evalCase.id)}
    >
      <div className="eval-entry-head">
        <button
          type="button"
          className="eval-trigger"
          aria-expanded={open}
          aria-controls={open ? detailId : undefined}
          aria-describedby={word === null ? undefined : wordId}
          onClick={open ? onClose : undefined}
        >
          <span className="eval-name">
            {evalCase.title}
            <span className="eval-rev">{evalCase.revision}</span>
          </span>
          <span className="eval-cap">{caption(evalCase, change, reason, open)}</span>
          <span className="sr-only">{summary(evalCase)}</span>
        </button>
        <div className="eval-sides">
          {SIDES.map((side) => (
            <div className="eval-side-row" key={side}>
              <span>{capitalized(side)}</span>
              <EntryMarks evalCase={evalCase} side={side} open={open} focus={focus} onSelectTrial={onSelectTrial} />
            </div>
          ))}
        </div>
      </div>
      {word === null ? null : (
        <div className={change.kind === "fewer" || failedTrial ? "eval-word fewer" : "eval-word"} id={wordId}>
          {word}
        </div>
      )}
      {trial !== undefined && focus !== null ? <Detail evalCase={evalCase} trial={trial} side={focus.side} id={detailId} /> : null}
    </article>
  );
}
