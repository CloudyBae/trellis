import { activity, ended, plainName, stateOf } from "@/model";
import type { ModelSession, PreparedAgent } from "@/model";
import { clockAt, duration, elapsed } from "@/lib/format";
import { AgentLabel } from "@/components/agent/AgentLabel";
import { roleOf } from "@/components/agent/roleOf";
import { noBreakTokens } from "@/components/agent/noBreakTokens";
import { useBoxStyle } from "@/hooks/useBoxStyle";
import type { Box } from "@/hooks/useBoxStyle";
import { AgentSpan } from "./AgentSpan";

type RowBox = Pick<Box, "top" | "height" | "paddingLeft">;

type AgentRowProps = {
  agent: PreparedAgent;
  box: RowBox;
  now: number;
  selected: boolean;
  showSource: boolean;
  onSelect: (id: number) => void;
};

export function SpawnRow({ agent, box, now, selected, showSource, onSelect }: AgentRowProps) {
  const ref = useBoxStyle<HTMLButtonElement>(box);
  const state = stateOf(agent, now);
  const detail = ended(agent, now)
    ? agent.brief || agent.task
    : state.s === "running"
      ? activity(agent, now)
      : state.note || agent.brief || agent.task;
  return (
    <div role="listitem">
      <button
        className={agent.parent ? "row" : "row root"}
        ref={ref}
        data-id={agent.id}
        data-key={`${agent.id}spawn`}
        aria-label={`${plainName(agent)}, ${state.s}, started ${elapsed(agent.start)}. ${detail}`}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(agent.id)}
      >
        <span className="l1">
          <span className="num">{elapsed(agent.start)}</span>
          <svg className="ricon" aria-hidden="true">
            <use href={`#r-${roleOf(agent)}`} />
          </svg>
          <span className="name">
            <AgentLabel agent={agent} />
          </span>
          <span className={`state s-${state.s}`}>{state.s}</span>
          {showSource ? <span className="src">{agent.src}</span> : null}
          <AgentSpan agent={agent} state={state.s} axisEnd={now} />
        </span>
        <span className="l2">{noBreakTokens(detail)}</span>
        {selected && agent.context.length > 0 && (
          <span className="l3">
            <span className="hand">handed in</span>
            {agent.context.map((item, index) => (
              <span className="chip" key={index}>
                {item}
              </span>
            ))}
          </span>
        )}
      </button>
    </div>
  );
}

export function ReturnRow({ agent, box, selected, onSelect, session }: Omit<AgentRowProps, "now" | "showSource"> & { session: ModelSession }) {
  const ref = useBoxStyle<HTMLButtonElement>(box);
  const parent = agent.parent == null ? undefined : session.by[agent.parent];
  const final = agent.final ?? "complete";
  const verb = final === "failed" ? "Failed" : parent ? "Returned" : "Finished";
  return (
    <div role="listitem">
      <button
        className={`row ret ${final}`}
        ref={ref}
        data-id={agent.id}
        data-key={`${agent.id}ret`}
        aria-current={selected ? "true" : undefined}
        aria-label={`${plainName(agent)} ${verb.toLowerCase()} at ${elapsed(agent.end ?? agent.start)} after ${duration((agent.end ?? agent.start) - agent.start)}. ${agent.returned?.summary ?? ""}`}
        onClick={() => onSelect(agent.id)}
      >
        <span className="l2">
          <span className="num">{elapsed(agent.end ?? agent.start)}</span>
          {`${verb}${parent ? ` to ${parent.name}` : ""} after ${duration((agent.end ?? agent.start) - agent.start)}: `}
          <b>{agent.returned?.summary ?? ""}</b>
        </span>
      </button>
    </div>
  );
}

type NowRowProps = {
  session: ModelSession;
  box: RowBox;
  now: number;
  growing: number;
  follow: boolean;
  onFollow: () => void;
};

export function NowRow({ session, box, now, growing, follow, onFollow }: NowRowProps) {
  const ref = useBoxStyle<HTMLDivElement>(box);
  const clock = clockAt(session.run.clock0, now);
  return (
    <div className="row nowrow" ref={ref} role="listitem">
      <div className="l2">
        {session.live ? (
          <>
            {"Now, "}
            <time data-clock>{clock}</time>
            {`. ${growing} agent${growing === 1 ? "" : "s"} still growing.`}
          </>
        ) : (
          `Session ended at ${clock}.`
        )}
        {!follow && (
          <>
            {" "}
            <button className="jump" data-follow onClick={onFollow}>
              Follow the growing tips
            </button>
          </>
        )}
      </div>
    </div>
  );
}
