import { alive, plainName, stateOf } from "@/model";
import type { PreparedAgent } from "@/model";
import { StateGlyph } from "@/components/agent/StateGlyph";
import { AgentLabel } from "@/components/agent/AgentLabel";
import { taskLabel } from "@/components/agent/taskLabel";

type KidsListProps = { agent: PreparedAgent; now: number; onGo: (id: number) => void };

export function KidsList({ agent, now, onGo }: KidsListProps) {
  const kids = agent.kids.flatMap((id) => {
    const kid = agent.by[id];
    return kid !== undefined && alive(kid, now) ? [kid] : [];
  });
  if (kids.length === 0) {
    return null;
  }
  return (
    <>
      <h2>Delegated to</h2>
      <ul className="kids">
        {kids.map((kid) => {
          const state = stateOf(kid, now).s;
          const task = taskLabel(kid);
          return (
            <li key={kid.id}>
              <button data-go={kid.id} onClick={() => onGo(kid.id)}>
                <StateGlyph state={state} />
                <span>
                  {task === null ? (
                    <AgentLabel agent={kid} />
                  ) : (
                    <>
                      {task} <span className="tag">{plainName(kid)}</span>
                    </>
                  )}
                </span>
                <span className={`state s-${state}`}>{state}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
