import { assertNever } from "./exhaustive";
import type { Session } from "../api";
import { toRealSession } from "./sessions";
import type { ModelSession } from "./types";

export type SessionStore = {
  sessions: ModelSession[];
  current: ModelSession | null;
};

export type StoreAction =
  | { type: "hello"; sessions: Session[] }
  | { type: "session"; session: Session }
  | { type: "remove"; id: string };

export const EMPTY_STORE: SessionStore = { sessions: [], current: null };

function upsert(
  sessions: ModelSession[],
  raw: Session,
): { sessions: ModelSession[]; stored: ModelSession } {
  const index = sessions.findIndex((candidate) => candidate.id === raw.id);
  const existing = index >= 0 ? sessions[index] : undefined;
  const previousRev = existing !== undefined && existing.real ? existing.rev : 0;
  const stored = toRealSession(raw, previousRev + 1);
  if (index < 0) {
    return { sessions: [...sessions, stored], stored };
  }
  return { sessions: sessions.map((candidate, at) => (at === index ? stored : candidate)), stored };
}

function applyHello(state: SessionStore, incoming: Session[]): SessionStore {
  const demos = state.sessions.filter((candidate) => !candidate.real);
  let sessions: ModelSession[] = [];
  incoming.forEach((raw) => {
    sessions = upsert(sessions, raw).sessions;
  });
  sessions = [...sessions, ...demos];
  const open = state.current;
  const refreshed =
    open !== null && open.real ? sessions.find((candidate) => candidate.id === open.id) : undefined;
  if (refreshed) {
    return { sessions, current: refreshed };
  }
  if (open === null) {
    return { sessions, current: sessions[0] ?? null };
  }
  return { sessions, current: open };
}

function applySession(state: SessionStore, raw: Session): SessionStore {
  const { sessions, stored } = upsert(state.sessions, raw);
  if (state.current === null || state.current.id === stored.id) {
    return { sessions, current: stored };
  }
  return { sessions, current: state.current };
}

function applyRemove(state: SessionStore, id: string): SessionStore {
  const index = state.sessions.findIndex((candidate) => candidate.id === id);
  const gone = state.sessions[index];
  if (gone === undefined) {
    return state;
  }
  const sessions = state.sessions.filter((_, at) => at !== index);
  return { sessions, current: state.current === gone ? (sessions[0] ?? null) : state.current };
}

export function reduceStore(state: SessionStore, action: StoreAction): SessionStore {
  switch (action.type) {
    case "hello":
      return applyHello(state, action.sessions);
    case "session":
      return applySession(state, action.session);
    case "remove":
      return applyRemove(state, action.id);
    default:
      return assertNever(action);
  }
}
