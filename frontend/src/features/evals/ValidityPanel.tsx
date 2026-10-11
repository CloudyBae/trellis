import type { EvalExperiment } from "@/model";
import { validitySummary } from "@/lib/evals";
import "./evals.css";

export function ValidityPanel({ experiment }: { experiment: EvalExperiment }) {
  return (
    <section aria-labelledby="eval-validity-title">
      <h2 id="eval-validity-title">Is this comparison valid?</h2>
      <dl className="eval-check">
        {validitySummary(experiment).map((item) => (
          <div key={item.term}>
            <dt>{item.term}</dt>
            <dd>
              {item.lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
