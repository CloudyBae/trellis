import { plainName } from "@/model";
import type { AgentStateName, PreparedAgent } from "@/model";
import { AgentLabel } from "@/components/agent/AgentLabel";
import { AgentPod } from "@/components/agent/AgentPod";
import { noBreakTokens } from "@/components/agent/noBreakTokens";
import { roleOf } from "@/components/agent/roleOf";
import { taskLabel } from "@/components/agent/taskLabel";
import { POD_SIZE } from "./placement";
import { useBoxStyle } from "@/hooks/useBoxStyle";

const NODE_ICON_SIZE = Math.round(POD_SIZE * 0.54);

type TreeNodeProps = {
  agent: PreparedAgent;
  state: AgentStateName;
  shownState: AgentStateName;
  activityText: string;
  failedCalls: number;
  left: number;
  top: number;
  width: number;
  root: boolean;
  selected: boolean;
  popping: boolean;
  onSelect: (id: number) => void;
  onPopped: (id: number) => void;
};

export function TreeNode(props: TreeNodeProps) {
  const { agent, state, activityText } = props;
  const buttonRef = useBoxStyle<HTMLButtonElement>({ left: props.left, top: props.top, width: props.width });
  const className = [
    "node",
    `s-${props.shownState}`,
    props.root ? "root" : "",
    props.popping ? "pop" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const task = taskLabel(agent);
  const failedNote = props.failedCalls > 0 ? `, ${props.failedCalls} failed call${props.failedCalls === 1 ? "" : "s"}` : "";
  const label = `${task ? `${task}, ` : ""}${plainName(agent)}, ${state}${failedNote}${activityText ? `. ${activityText}` : ""}`;
  return (
    <button
      className={className}
      data-fid={agent.id}
      ref={buttonRef}
      aria-current={props.selected ? "true" : undefined}
      aria-label={label}
      onClick={() => props.onSelect(agent.id)}
      onAnimationEnd={(event) => {
        if (event.animationName === "pop") {
          props.onPopped(agent.id);
        }
      }}
    >
      <AgentPod role={roleOf(agent)} state={state} iconSize={NODE_ICON_SIZE} swayWhileRunning />
      <span className="ntext">
        {task === null ? (
          <span className="nname">
            <AgentLabel agent={agent} />
          </span>
        ) : (
          <>
            <span className="nname task">{task}</span>
            <span className="ntag">
              <AgentLabel agent={agent} />
            </span>
          </>
        )}
        {state === "complete" ? null : (
          <span className="nmeta">
            <span className={`state s-${state}`}>{state}</span>
          </span>
        )}
        {activityText ? <span className="nact">{noBreakTokens(activityText)}</span> : null}
      </span>
    </button>
  );
}
