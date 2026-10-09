import { describe, expect, it } from "vitest";
import { sessionNow, toRealSession } from "./sessions";
import type { DemoSession, RealSession } from "./types";
import { agentOf } from "./agentFixtures";

const T0 = Date.UTC(2026, 8, 28, 12, 0, 0);

function realSession(overrides: { live: boolean; endAt: number }): RealSession {
  return toRealSession(
    {
      id: "cc:one",
      live: overrides.live,
      t0: T0,
      endAt: overrides.endAt,
      run: { name: "run", repo: "repo", source: "Claude Code", file: "file" },
      agents: [agentOf(1)],
    },
    1,
  );
}

function demoSession(overrides: Partial<DemoSession>): DemoSession {
  return {
    real: false,
    id: "demo",
    live: false,
    replay: false,
    t0: 0,
    endAt: 162,
    nowAt: 312,
    run: { name: "", repo: "", source: "", file: "", clock0: 0 },
    agents: [],
    by: {},
    ...overrides,
  };
}

describe("sessionNow for served sessions", () => {
  it("rounds the wall clock up for a live session", () => {
    const session = realSession({ live: true, endAt: 10 });
    expect(sessionNow(session, T0 + 25_001, 0)).toBe(26);
  });

  it("never falls behind the latest event on a live session", () => {
    const session = realSession({ live: true, endAt: 10 });
    expect(sessionNow(session, T0 + 3000, 99)).toBe(10);
    expect(sessionNow(session, T0 - 8000, 99)).toBe(10);
  });

  it("stays at the end of a finished session whatever the clock says", () => {
    const session = realSession({ live: false, endAt: 10 });
    expect(sessionNow(session, T0 + 500_000, 99)).toBe(10);
  });
});

describe("sessionNow for demo sessions", () => {
  it("counts from the replay start and never goes negative", () => {
    const session = demoSession({ replay: true, t0: 40 });
    expect(sessionNow(session, T0, 100)).toBe(60);
    expect(sessionNow(session, T0, 10)).toBe(0);
  });

  it("advances a live demo with the tick", () => {
    expect(sessionNow(demoSession({ live: true }), T0, 7)).toBe(319);
  });

  it("holds a finished demo at its fixed time", () => {
    expect(sessionNow(demoSession({ live: false }), T0, 7)).toBe(312);
  });
});

describe("toRealSession", () => {
  it("derives the wall clock origin from the start time in local time", () => {
    const start = new Date(2026, 8, 28, 9, 2, 30);
    const session = toRealSession(
      {
        id: "cc:clock",
        live: false,
        t0: start.getTime(),
        endAt: 5,
        run: { name: "run", repo: "repo", source: "Claude Code", file: "file" },
        agents: [agentOf(2, { parent: 1, start: 4 }), agentOf(1)],
      },
      3,
    );
    expect(session.run.clock0).toBe(9 * 3600 + 2 * 60 + 30);
    expect(session.nowAt).toBe(5);
    expect(session.rev).toBe(3);
    expect(session.agents.map((agent) => agent.id)).toEqual([1, 2]);
    expect(session.by[1]?.kids).toEqual([2]);
  });
});
