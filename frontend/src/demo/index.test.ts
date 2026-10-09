import { describe, expect, it } from "vitest";
import { alive, sessionNow, stateOf } from "../model";
import { createDemoSessions, createReplayDemo, DEMO_REPLAY_ID } from "./index";

describe("demo sessions", () => {
  it("builds the six synthetic runs with unique ids and a root agent each", () => {
    const sessions = createDemoSessions();
    expect(sessions.map((session) => session.id)).toEqual([
      "rotate",
      "research",
      "flaky",
      "notes",
      "node22",
      "leak",
    ]);
    sessions.forEach((session) => {
      expect(session.real).toBe(false);
      expect(session.by[1]?.parent).toBeUndefined();
      expect(session.agents.every((agent) => agent.by === session.by)).toBe(true);
      expect(session.agents.map((agent) => agent.id)).toEqual(
        [...session.agents.map((agent) => agent.id)].sort((left, right) => left - right),
      );
    });
  });

  it("replays only the rate limiting run, from its first second", () => {
    const replay = createReplayDemo();
    expect(replay.id).toBe(DEMO_REPLAY_ID);
    expect(replay.replay).toBe(true);
    expect(sessionNow(replay, 0, 0)).toBe(0);
    const root = replay.by[1];
    expect(root && stateOf(root, 0).s).toBe("running");
    expect(replay.agents.filter((agent) => alive(agent, 0))).toHaveLength(1);
    expect(createDemoSessions().filter((session) => session.replay)).toHaveLength(1);
  });

  it("reproduces the states of the live rotate run at its opening time", () => {
    const rotate = createDemoSessions()[0];
    if (rotate === undefined) {
      throw new Error("Missing rotate demo");
    }
    const time = sessionNow(rotate, 0, 0);
    expect(time).toBe(312);
    const states = Object.fromEntries(
      rotate.agents.filter((agent) => alive(agent, time)).map((agent) => [agent.id, stateOf(agent, time).s]),
    );
    expect(states).toEqual({
      1: "waiting",
      2: "complete",
      3: "complete",
      4: "complete",
      5: "complete",
      6: "waiting",
      7: "blocked",
      8: "waiting",
      9: "complete",
      10: "failed",
      11: "running",
      12: "running",
    });
  });
});
