import type { AgentStateName } from "@/model";
import type { Role } from "./roleOf";
import "./agentMarks.css";

type AgentPodProps = {
  role: Role;
  state: AgentStateName;
  iconSize: number;
  swayWhileRunning: boolean;
};

export function AgentPod({ role, state, iconSize, swayWhileRunning }: AgentPodProps) {
  return (
    <span className="pod">
      <svg className="role" aria-hidden="true" width={iconSize} height={iconSize}>
        <use href={`#r-${role}`} />
      </svg>
      <span className="badge">
        <svg aria-hidden="true">
          <use className={swayWhileRunning && state === "running" ? "sway" : undefined} href={`#g-${state}`} />
        </svg>
      </span>
    </span>
  );
}
