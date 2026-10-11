import type { EvalExperiment } from "@/model";
import { caseCountWords, unknownCount } from "@/lib/evals";
import type { ChangeGroups, EvalFocus } from "@/lib/evals";
import { LedgerEntry } from "./LedgerEntry";
import { StaticMark } from "./TrialMark";
import "./evals.css";

type LedgerProps = {
  experiment: EvalExperiment;
  groups: ChangeGroups;
  focus: EvalFocus | null;
  expanded: boolean;
  onToggleFold: () => void;
  onOpen: (caseId: string) => void;
  onClose: () => void;
  onSelectTrial: (focus: EvalFocus) => void;
};

const UNCHANGED_ID = "eval-unchanged";

export function Ledger({ experiment, groups, focus, expanded, onToggleFold, onOpen, onClose, onSelectTrial }: LedgerProps) {
  const entryProps = { focus, onOpen, onClose, onSelectTrial };
  const firstUnchanged = groups.unchanged[0];
  return (
    <>
      {experiment.cases.length === 0 ? <p className="eval-empty">No cases in this experiment yet.</p> : null}
      {groups.groups.map((group) => (
        <section className={`eval-group ${group.kind}`} key={group.kind} aria-labelledby={`eval-group-${group.kind}`}>
          <h2 id={`eval-group-${group.kind}`}>
            <span className="title">{group.title}</span>
            <span className="count">{caseCountWords(group.cases.length)}</span>
          </h2>
          {group.cases.map((evalCase) => (
            <LedgerEntry key={evalCase.id} evalCase={evalCase} open={focus?.caseId === evalCase.id} {...entryProps} />
          ))}
        </section>
      ))}
      {firstUnchanged === undefined ? null : (
        <div className="eval-unchanged">
          <button type="button" className="eval-fold" aria-expanded={expanded} aria-controls={UNCHANGED_ID} onClick={onToggleFold}>
            <svg className="eval-fold-chevron" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M4.5 2.5 8 6 4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="eval-marks" aria-hidden="true">
              {firstUnchanged.candidate.map((trial) => (
                <StaticMark key={trial.attempt} verdict={trial.verdict} />
              ))}
            </span>
            <b>{groups.unchanged.length} unchanged</b>
            {expanded ? null : (
              <span className="names">
                {groups.unchanged
                  .map((evalCase) => {
                    const unknown = unknownCount(evalCase);
                    return unknown === 0 ? evalCase.title : `${evalCase.title} (${unknown} awaiting a label)`;
                  })
                  .join(" · ")}
              </span>
            )}
          </button>
          {expanded ? (
            <div className="eval-entries" id={UNCHANGED_ID}>
              {groups.unchanged.map((evalCase) => (
                <LedgerEntry key={evalCase.id} evalCase={evalCase} open={focus?.caseId === evalCase.id} {...entryProps} />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
