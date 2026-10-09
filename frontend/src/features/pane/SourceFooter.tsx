import { plainName } from "@/model";
import type { ModelSession, PreparedAgent } from "@/model";

const APPROX_TIMES_NOTE = " This tool records one time per request, so steps within a request are spaced evenly.";

export function SourceFooter({ session, agent }: { session: ModelSession; agent: PreparedAgent }) {
  if (!session.real) {
    return (
      <div className="src-foot">
        Read from <span className="mono">{session.run.file}</span>
        {agent.parent ? `, ${plainName(agent)}` : ""}. Synthetic demo data.
      </div>
    );
  }
  return (
    <div className="src-foot">
      Read from <span className="mono">{agent.file || session.run.file}</span>.
      {session.by[1]?.approxTimes ? APPROX_TIMES_NOTE : ""}
    </div>
  );
}
