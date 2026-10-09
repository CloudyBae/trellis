import { describe, expect, it } from "vitest";
import type { Session } from "../api";
import { agentOf } from "./agentFixtures";
import { EMPTY_STORE, reduceStore } from "./store";
import type { SessionStore } from "./store";
import type { DemoSession, ModelSession } from "./types";

function sessionOf(id: string, endAt = 10): Session {
  return {
    id,
    live: true,
    t0: Date.UTC(2026, 8, 28, 12, 0, 0),
    endAt,
    run: { name: id, repo: "repo", source: "Claude Code", file: "file" },
    agents: [agentOf(1)],
  };
}

const demo: DemoSession = {
  real: false,
  id: "research",
  live: true,
  replay: true,
  t0: 0,
  endAt: 162,
  nowAt: 0,
  run: { name: "demo", repo: "", source: "", file: "", clock0: 0 },
  agents: [],
  by: {},
};

function idsOf(state: SessionStore): string[] {
  return state.sessions.map((session) => session.id);
}

function apply(state: SessionStore, ...sessions: Session[]): SessionStore {
  return sessions.reduce((next, session) => reduceStore(next, { type: "session", session }), state);
}

describe("hello", () => {
  it("replaces the session list and selects the first when nothing is open", () => {
    const start = apply(EMPTY_STORE, sessionOf("old"));
    const empty: SessionStore = { sessions: start.sessions, current: null };
    const next = reduceStore(empty, { type: "hello", sessions: [sessionOf("a"), sessionOf("b")] });
    expect(idsOf(next)).toEqual(["a", "b"]);
    expect(next.current?.id).toBe("a");
  });

  it("keeps a running demo after the served sessions", () => {
    const state: SessionStore = { sessions: [demo], current: demo };
    const next = reduceStore(state, { type: "hello", sessions: [sessionOf("a")] });
    expect(idsOf(next)).toEqual(["a", "research"]);
    expect(next.current).toBe(demo);
  });

  it("drops the demo when none was running", () => {
    const state = apply(EMPTY_STORE, sessionOf("a"));
    const next = reduceStore(state, { type: "hello", sessions: [sessionOf("b")] });
    expect(idsOf(next)).toEqual(["b"]);
  });

  it("restarts revisions and re-adopts the open served session", () => {
    const state = apply(EMPTY_STORE, sessionOf("a"), sessionOf("a"), sessionOf("a"));
    expect(state.current?.real && state.current.rev).toBe(3);
    const next = reduceStore(state, { type: "hello", sessions: [sessionOf("a")] });
    expect(next.current?.real && next.current.rev).toBe(1);
    expect(next.current).toBe(next.sessions[0]);
  });
});

describe("session", () => {
  it("adds a new session and opens it when nothing is open", () => {
    const next = apply(EMPTY_STORE, sessionOf("a"));
    expect(idsOf(next)).toEqual(["a"]);
    expect(next.current?.id).toBe("a");
  });

  it("bumps the revision by one and replaces in place", () => {
    const first = apply(EMPTY_STORE, sessionOf("a"), sessionOf("b"));
    const next = apply(first, sessionOf("a", 40));
    expect(idsOf(next)).toEqual(["a", "b"]);
    const replaced: ModelSession | undefined = next.sessions[0];
    expect(replaced?.real && replaced.rev).toBe(2);
    expect(replaced?.endAt).toBe(40);
    expect(next.current).toBe(replaced);
  });

  it("leaves the open session alone when another one changes", () => {
    const first = apply(EMPTY_STORE, sessionOf("a"), sessionOf("b"));
    const next = apply(first, sessionOf("b", 50));
    expect(next.current?.id).toBe("a");
    expect(next.current).toBe(first.current);
  });
});

describe("remove", () => {
  it("selects the next session when the open one goes", () => {
    const state = apply(EMPTY_STORE, sessionOf("a"), sessionOf("b"), sessionOf("c"));
    const next = reduceStore(state, { type: "remove", id: "a" });
    expect(idsOf(next)).toEqual(["b", "c"]);
    expect(next.current?.id).toBe("b");
  });

  it("clears the selection when the last session goes", () => {
    const state = apply(EMPTY_STORE, sessionOf("a"));
    expect(reduceStore(state, { type: "remove", id: "a" })).toEqual({ sessions: [], current: null });
  });

  it("keeps the open session when another goes", () => {
    const state = apply(EMPTY_STORE, sessionOf("a"), sessionOf("b"));
    const next = reduceStore(state, { type: "remove", id: "b" });
    expect(next.current).toBe(state.current);
  });

  it("ignores an unknown id", () => {
    const state = apply(EMPTY_STORE, sessionOf("a"));
    expect(reduceStore(state, { type: "remove", id: "zzz" })).toBe(state);
  });
});
