import type { AgentStateName } from "@/model";

export function StateGlyph({ state }: { state: AgentStateName }) {
  return (
    <svg aria-hidden="true">
      <use href={`#g-${state}`} />
    </svg>
  );
}
