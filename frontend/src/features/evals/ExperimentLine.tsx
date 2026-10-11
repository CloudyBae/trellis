import type { EvalExperiment } from "@/model";
import { Button } from "@/components/ui/Button";
import "./evals.css";

type ExperimentLineProps = {
  experiment: EvalExperiment;
  regressionCount: number;
  onNextRegression: () => void;
};

function regressionWords(count: number): string {
  return `${count} ${count === 1 ? "regression" : "regressions"}`;
}

export function ExperimentLine({ experiment, regressionCount, onNextRegression }: ExperimentLineProps) {
  const complete = experiment.status === "complete";
  const meta = [
    `${experiment.baseline.label} ${experiment.baseline.version} → ${experiment.candidate.label} ${experiment.candidate.version}`,
    `grader ${experiment.graderVersion}`,
    `${experiment.cases.length} cases × ${experiment.trialsPerCase} trials`,
    complete ? "complete" : "in progress",
  ].join(" · ");
  const none = complete ? "no regressions" : "no regressions so far";

  return (
    <div className="run flex min-w-zero flex-col leading-snug">
      <div className="run-line flex min-w-zero flex-wrap items-center gap-x-sm gap-y-2xs">
        <span className="run-name min-w-zero truncate text-run font-bold">{experiment.title}</span>
        {experiment.synthetic ? (
          <span className="demo flex-none text-note whitespace-nowrap text-pollen-ink">synthetic demo</span>
        ) : null}
        {regressionCount > 0 ? (
          <Button
            variant="link"
            className={"flex-none text-label text-rose-ink hover:text-rose-ink"}
            title="Show the next regression (n)"
            onClick={onNextRegression}
          >
            {regressionWords(regressionCount)}
          </Button>
        ) : (
          <span className="flex-none text-label text-ink-3">{none}</span>
        )}
      </div>
      <div className="run-meta eval-meta truncate text-state text-ink-3" title={meta}>
        {meta}
      </div>
    </div>
  );
}
