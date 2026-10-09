import { activity, assertNever, ended, failedCalls } from "@/model";
import type { AgentState, ModelSession, PreparedAgent } from "@/model";
import { duration } from "@/lib/format";
import { AgentLabel } from "@/components/agent/AgentLabel";
import { AgentPod } from "@/components/agent/AgentPod";
import { roleOf } from "@/components/agent/roleOf";
import { LongText } from "./LongText";
import { completenessLabel } from "./completeness";
import { STATUS_TITLE } from "./statusTitle";

type IdentityHeaderProps = {
  agent: PreparedAgent;
  parent: PreparedAgent | undefined;
  session: ModelSession;
  state: AgentState;
  now: number;
  onClose: () => void;
  onGo: (id: number) => void;
};

function StatusBody({ agent, state, now }: { agent: PreparedAgent; state: AgentState; now: number }) {
  switch (state.s) {
    case "running":
      return (
        <p>
          <LongText text={activity(agent, now)} limit={400} />
        </p>
      );
    case "blocked":
      return (
        <>
          <p>{state.note}</p>
          <p className="aside">Trellis only watches. Answer the prompt in {agent.src} and this agent will carry on.</p>
        </>
      );
    case "waiting":
      return <p>{state.note}</p>;
    case "failed":
    case "complete": {
      const failed = failedCalls(agent, now);
      return (
        <>
          <p>{agent.returned?.summary}</p>
          {failed > 0 ? (
            <p className="aside">
              {`${failed} tool call${failed === 1 ? "" : "s"} failed along the way${state.s === "complete" ? "; the agent still finished" : ""}.`}
            </p>
          ) : null}
        </>
      );
    }
    default:
      return assertNever(state);
  }
}

export function IdentityHeader({ agent, parent, state, now, onClose, onGo }: IdentityHeaderProps) {
  const done = ended(agent, now);
  const elapsed = (done ? (agent.end ?? now) : now) - agent.start;
  return (
    <>
      <button className="back" data-close="" onClick={onClose}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M10 3 L5 8 L10 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back to the run
      </button>
      <div className={`who s-${state.s}`}>
        <AgentPod role={roleOf(agent)} state={state.s} iconSize={28} swayWhileRunning={false} />
        <div>
          <h1>
            <AgentLabel agent={agent} />
          </h1>
          <p>
            {agent.src}
            {parent === undefined ? (
              " · main session"
            ) : (
              <>
                {" · delegated by "}
                <button data-go={parent.id} onClick={() => onGo(parent.id)}>
                  {parent.name}
                </button>
              </>
            )}
          </p>
          {agent.model ? <p className="model">{agent.model}</p> : null}
          <p className="completeness" data-completeness={agent.completeness}>
            {completenessLabel(agent.completeness)}
          </p>
        </div>
      </div>
      <div className={`status ${state.s}`}>
        <div className="st">
          {STATUS_TITLE[state.s]}
          <time data-elapsed={done ? "" : agent.start}>
            {done ? "took " : ""}
            {duration(elapsed)}
          </time>
        </div>
        <StatusBody agent={agent} state={state} now={now} />
      </div>
    </>
  );
}
