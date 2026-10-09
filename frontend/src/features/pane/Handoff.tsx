import { ended } from "@/model";
import type { ModelSession, PreparedAgent } from "@/model";
import { clockAt } from "@/lib/format";
import { LongText } from "./LongText";

const TASK_PREVIEW_LIMIT = 240;

type HandoffProps = {
  agent: PreparedAgent;
  parent: PreparedAgent | undefined;
  session: ModelSession;
  now: number;
};

export function Handoff({ agent, parent, session, now }: HandoffProps) {
  const clock = (seconds: number): string => clockAt(session.run.clock0, seconds);
  const returned = agent.returned;
  const hasDetail = Boolean(returned && (returned.items.length > 0 || returned.text || returned.note));
  return (
    <>
      {ended(agent, now) && returned && hasDetail ? (
        <>
          <h2>{parent ? `Returned to ${parent.name}` : "Final result"}</h2>
          <div className="handoff returned">
            <div className="from">at {clock(agent.end ?? now)}</div>
            {returned.items.length > 0 ? (
              <ul>
                {returned.items.map((item, index) => (
                  <li key={`${index}:${item}`}>{item}</li>
                ))}
              </ul>
            ) : null}
            {returned.text ? (
              <details className="more">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <span className="toggle"></span>
                </summary>
                <div className="full">{returned.text}</div>
              </details>
            ) : null}
            {returned.note ? <p className="note">{returned.note}</p> : null}
          </div>
        </>
      ) : null}
      <h2>{parent ? `Handed in by ${parent.name}` : "Your request"}</h2>
      <div className="handoff">
        <div className="from">{parent ? `${parent.name} at ${clock(agent.start)}` : `at ${clock(agent.start)}`}</div>
        <blockquote>
          <LongText text={agent.task} limit={TASK_PREVIEW_LIMIT} />
        </blockquote>
        {agent.context.length > 0 ? (
          <div className="chips">
            {agent.context.map((path, index) => (
              <span className="chip" key={`${index}:${path}`}>
                {path}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
