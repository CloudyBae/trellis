import { alive, stateOf } from "@/model";
import type { AgentStateName, ModelSession, PreparedAgent } from "@/model";
import type { View } from "@/lib/view";
import type { SelectOptions } from "@/lib/viewProps";

export type ShortcutContext = {
  session: ModelSession | null;
  selectedId: number | null;
  now: number;
  narrow: boolean;
  view: View;
  menuOpen: boolean;
  select: (id: number, options?: SelectOptions) => void;
  closePane: () => void;
  stepSession: (direction: 1 | -1) => void;
  announce: (text: string) => void;
};

const MOVE_KEYS = ["ArrowDown", "ArrowUp", "j", "k"];

export function attentionAgents(session: ModelSession, now: number): PreparedAgent[] {
  const live = session.agents.filter((agent) => alive(agent, now));
  const stateIs = (agent: PreparedAgent, name: AgentStateName) => stateOf(agent, now).s === name;
  return [
    ...live.filter((agent) => stateIs(agent, "blocked")),
    ...live.filter((agent) => stateIs(agent, "failed")),
  ];
}

function insidePane(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("#pane") !== null;
}

function onRunSwitch(target: EventTarget | null): boolean {
  return target instanceof Element && target.id === "runSwitch";
}

function jumpToAttention(session: ModelSession, context: ShortcutContext, event: KeyboardEvent): void {
  if (insidePane(event.target)) {
    return;
  }
  const list = attentionAgents(session, context.now);
  if (list.length === 0) {
    context.announce("Nothing in this run needs you");
    return;
  }
  const index = list.findIndex((agent) => agent.id === context.selectedId);
  const next = list[(index + 1) % list.length];
  if (next === undefined) {
    return;
  }
  event.preventDefault();
  context.select(next.id, { reveal: true, focusTarget: true });
}

function moveSelection(session: ModelSession, context: ShortcutContext, event: KeyboardEvent): void {
  if (insidePane(event.target) || onRunSwitch(event.target)) {
    return;
  }
  const ids = session.agents
    .filter((agent) => alive(agent, context.now))
    .sort((left, right) => left.start - right.start)
    .map((agent) => agent.id);
  const target = ids[0];
  if (target === undefined) {
    return;
  }
  const index = ids.indexOf(context.selectedId ?? Number.NaN);
  const forward = event.key === "ArrowDown" || event.key === "j";
  const nextIndex = forward ? Math.min(index + 1, ids.length - 1) : Math.max(index - 1, 0);
  event.preventDefault();
  context.select(ids[nextIndex] ?? target, { reveal: true, focusTarget: true });
}

export function handleShortcut(event: KeyboardEvent, context: ShortcutContext): void {
  const { session } = context;
  if (session === null || context.menuOpen || event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }
  if (event.key === "Escape") {
    if (context.selectedId !== null && context.narrow) {
      context.closePane();
    } else if (!context.narrow && context.selectedId !== 1) {
      context.select(1, { reveal: true });
    }
    return;
  }
  if (event.key === "[" || event.key === "]") {
    event.preventDefault();
    context.stepSession(event.key === "]" ? 1 : -1);
    return;
  }
  if (event.key === "n") {
    jumpToAttention(session, context, event);
    return;
  }
  if (MOVE_KEYS.includes(event.key)) {
    moveSelection(session, context, event);
  }
}
