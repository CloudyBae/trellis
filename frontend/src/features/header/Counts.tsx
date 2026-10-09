import { useState } from "react";
import { alive, stateOf } from "@/model";
import type { AgentStateName, ModelSession } from "@/model";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { StateGlyph } from "@/components/agent/StateGlyph";

export const COUNT_ORDER: AgentStateName[] = ["running", "waiting", "blocked", "failed", "complete"];

type StateCounts = Record<AgentStateName, number>;

export function countStates(session: ModelSession, now: number): StateCounts {
  const counts: StateCounts = { running: 0, waiting: 0, blocked: 0, failed: 0, complete: 0 };
  session.agents
    .filter((agent) => alive(agent, now))
    .forEach((agent) => {
      counts[stateOf(agent, now).s] += 1;
    });
  return counts;
}

type CountsSnapshot = { sessionId: string; counts: StateCounts; changed: Record<AgentStateName, boolean> };

const NONE_CHANGED: Record<AgentStateName, boolean> = {
  running: false,
  waiting: false,
  blocked: false,
  failed: false,
  complete: false,
};

export function Counts({
  session,
  now,
  onCycle,
}: {
  session: ModelSession;
  now: number;
  onCycle: (state: AgentStateName) => void;
}) {
  const counts = countStates(session, now);
  const [snapshot, setSnapshot] = useState<CountsSnapshot>({ sessionId: session.id, counts, changed: NONE_CHANGED });
  const isStale = snapshot.sessionId !== session.id || COUNT_ORDER.some((state) => snapshot.counts[state] !== counts[state]);
  let current = snapshot;
  if (isStale) {
    const sameSession = snapshot.sessionId === session.id;
    current = {
      sessionId: session.id,
      counts,
      changed: {
        running: sameSession && snapshot.counts.running !== counts.running,
        waiting: sameSession && snapshot.counts.waiting !== counts.waiting,
        blocked: sameSession && snapshot.counts.blocked !== counts.blocked,
        failed: sameSession && snapshot.counts.failed !== counts.failed,
        complete: sameSession && snapshot.counts.complete !== counts.complete,
      },
    };
    setSnapshot(current);
  }

  return (
    <nav className="counts flex flex-none gap-2xs" id="counts" aria-label="Agents by state">
      {COUNT_ORDER.map((state) => {
        const total = counts[state];
        const changed = current.changed[state];
        return (
          <Button
            key={state}
            className="count grid grid-cols-2 justify-items-start gap-x-xs rounded-md pt-xs pr-sm pb-xs pl-s disabled:opacity-100 disabled:[&_svg]:opacity-60 [&_svg]:size-md"
            data-state={state}
            disabled={total === 0}
            aria-label={`${total} ${state}${total ? ", show next" : ""}`}
            title={`${total} ${state}`}
            onClick={() => onCycle(state)}
          >
            <StateGlyph state={state} />
            <Badge key={`${session.id}:${total}`} className={cn(changed && "bump", total === 0 && "text-ink-3")}>
              {total}
            </Badge>
            <span className="col-span-full text-caption text-ink-3">{state}</span>
          </Button>
        );
      })}
    </nav>
  );
}
