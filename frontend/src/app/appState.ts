import type { Session } from "@/api";
import { createDemoSessions, createReplayDemo, DEMO_REPLAY_ID } from "@/demo";
import { assertNever, EMPTY_STORE, plainName, reduceStore, stateOf } from "@/model";
import type { ModelSession, SessionStore } from "@/model";
import type { ShellEnvironment } from "@/lib/clock";
import { defaultSelection, orderSessions, timeOf } from "@/lib/sessionDisplay";

export type Announcement = { text: string };

export type AppState = {
  store: SessionStore;
  selectedId: number | null;
  served: boolean;
  emptyMode: boolean;
  connected: boolean;
  linkDown: boolean;
  unreachable: boolean;
  announcement: Announcement;
};

export type AppIntent =
  | { type: "hello"; sessions: Session[] }
  | { type: "session"; session: Session }
  | { type: "remove"; id: string }
  | { type: "streamError" }
  | { type: "open"; id: string; announce: boolean }
  | { type: "startDemo" }
  | { type: "closeDemo" }
  | { type: "previewEmpty" }
  | { type: "select"; id: number }
  | { type: "deselect" }
  | { type: "announce"; text: string };

export type AppAction = { env: ShellEnvironment; intent: AppIntent };

export type LocationParts = { protocol: string; search: string; hash: string };

export function isServed(location: LocationParts): boolean {
  const overHttp = location.protocol === "http:" || location.protocol === "https:";
  return overHttp && !new URLSearchParams(location.search).has("demo");
}

export function wantsEmpty(location: LocationParts): boolean {
  return (location.hash + location.search).includes("empty");
}

export function createInitialState(location: LocationParts, env: ShellEnvironment): AppState {
  const served = isServed(location);
  const emptyMode = !served && wantsEmpty(location);
  const sessions: ModelSession[] = served || emptyMode ? [] : createDemoSessions();
  const current = sessions[0] ?? null;
  return {
    store: { sessions, current },
    selectedId: current === null ? null : defaultSelection(current, env.narrow, env),
    served,
    emptyMode,
    connected: false,
    linkDown: false,
    unreachable: false,
    announcement: { text: "" },
  };
}

function withSession(
  state: AppState,
  sessions: ModelSession[],
  session: ModelSession,
  env: ShellEnvironment,
  announce: boolean,
): AppState {
  return {
    ...state,
    store: { sessions, current: session },
    selectedId: defaultSelection(session, env.narrow, env),
    announcement: announce ? { text: `Showing ${session.run.name}` } : state.announcement,
  };
}

function openSession(
  state: AppState,
  sessions: ModelSession[],
  id: string,
  env: ShellEnvironment,
  announce: boolean,
): AppState {
  const target = sessions.find((candidate) => candidate.id === id);
  if (target === undefined) {
    return { ...state, store: { sessions, current: state.store.current } };
  }
  const restarted: ModelSession = !target.real && target.replay ? { ...target, t0: env.tick } : target;
  const next = sessions.map((candidate) => (candidate === target ? restarted : candidate));
  return withSession(state, next, restarted, env, announce);
}

function showFirst(state: AppState, sessions: ModelSession[], env: ShellEnvironment): AppState {
  const first = orderSessions(sessions, env).all[0];
  if (first === undefined) {
    return { ...state, store: { sessions, current: null }, selectedId: null };
  }
  return openSession(state, sessions, first.id, env, false);
}

function applyHello(state: AppState, incoming: Session[], env: ShellEnvironment): AppState {
  const open = state.store.current;
  const store = reduceStore(state.store, { type: "hello", sessions: incoming });
  const base: AppState = {
    ...state,
    connected: true,
    linkDown: false,
    unreachable: false,
    announcement: state.linkDown ? { text: "Reconnected to the Trellis server" } : state.announcement,
  };
  if (open === null || store.current === null) {
    return showFirst(base, store.sessions, env);
  }
  if (store.current === open) {
    return { ...base, store };
  }
  return keepSelection(base, store, env);
}

function keepSelection(state: AppState, store: SessionStore, env: ShellEnvironment): AppState {
  const current = store.current;
  if (current === null) {
    return { ...state, store, selectedId: null };
  }
  const missing = state.selectedId !== null && current.by[state.selectedId] === undefined;
  return {
    ...state,
    store,
    selectedId: missing ? defaultSelection(current, env.narrow, env) : state.selectedId,
  };
}

function applySession(state: AppState, incoming: Session, env: ShellEnvironment): AppState {
  const open = state.store.current;
  const store = reduceStore(state.store, { type: "session", session: incoming });
  if (open === null && store.current !== null) {
    return withSession(state, store.sessions, store.current, env, true);
  }
  if (open !== null && store.current !== open) {
    return keepSelection(state, store, env);
  }
  return { ...state, store };
}

function applyRemove(state: AppState, id: string, env: ShellEnvironment): AppState {
  const open = state.store.current;
  const store = reduceStore(state.store, { type: "remove", id });
  if (open !== null && store.current !== open) {
    return showFirst(state, store.sessions, env);
  }
  return { ...state, store };
}

function applyStreamError(state: AppState): AppState {
  if (state.connected) {
    return state.linkDown
      ? state
      : {
          ...state,
          linkDown: true,
          announcement: { text: "Trellis server stopped. Showing the last state and reconnecting." },
        };
  }
  return {
    ...state,
    unreachable: true,
    announcement: { text: "Can't reach the Trellis server." },
  };
}

function applyStartDemo(state: AppState, env: ShellEnvironment): AppState {
  const { sessions } = state.store;
  const withDemo = sessions.some((session) => session.id === DEMO_REPLAY_ID)
    ? sessions
    : [...sessions, createReplayDemo()];
  return openSession(state, withDemo, DEMO_REPLAY_ID, env, false);
}

function applyCloseDemo(state: AppState, env: ShellEnvironment): AppState {
  const sessions = state.store.sessions.filter((session) => session.id !== DEMO_REPLAY_ID);
  return showFirst(state, sessions, env);
}

function applySelect(state: AppState, id: number, env: ShellEnvironment): AppState {
  const current = state.store.current;
  const agent = current?.by[id];
  if (current === null || agent === undefined) {
    return { ...state, selectedId: id };
  }
  const announcement = { text: `${plainName(agent)}, ${stateOf(agent, timeOf(current, env)).s}` };
  return { ...state, selectedId: id, announcement };
}

export function reduceApp(state: AppState, action: AppAction): AppState {
  const { env, intent } = action;
  switch (intent.type) {
    case "hello":
      return applyHello(state, intent.sessions, env);
    case "session":
      return applySession(state, intent.session, env);
    case "remove":
      return applyRemove(state, intent.id, env);
    case "streamError":
      return applyStreamError(state);
    case "open":
      return openSession(state, state.store.sessions, intent.id, env, intent.announce);
    case "startDemo":
      return applyStartDemo(state, env);
    case "closeDemo":
      return applyCloseDemo(state, env);
    case "previewEmpty":
      return { ...state, emptyMode: true, store: EMPTY_STORE, selectedId: null };
    case "select":
      return applySelect(state, intent.id, env);
    case "deselect":
      return { ...state, selectedId: null };
    case "announce":
      return { ...state, announcement: { text: intent.text } };
    default:
      return assertNever(intent);
  }
}
