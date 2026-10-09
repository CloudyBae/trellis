import type { AgentStateName, PreparedAgent } from "@/model";

const MIN_BAR_SHARE = 2;

export function AgentSpan({ agent, state, axisEnd }: { agent: PreparedAgent; state: AgentStateName; axisEnd: number }) {
  const axis = Math.max(axisEnd, 1);
  const end = agent.end ?? axisEnd;
  const left = (agent.start / axis) * 100;
  const width = Math.max(((end - agent.start) / axis) * 100, MIN_BAR_SHARE);
  return (
    <svg className={`span s-${state}`} viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
      <rect className="track" width="100" height="6" rx="2.5" />
      <rect className="bar" x={left} width={Math.min(width, 100 - left)} height="6" rx="2.5" />
    </svg>
  );
}
