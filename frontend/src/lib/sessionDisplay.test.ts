import { describe, expect, it } from "vitest";
import { createReplayDemo } from "@/demo";
import { toRealSession } from "@/model";
import type { Session } from "@/api";
import type { Clock } from "./clock";
import { attentionAlert, describeEntry, orderSessions } from "./sessionDisplay";
import { SESSION_START, agentOf, sessionOf } from "@/test/testSupport";

const clock: Clock = { clockMs: SESSION_START + 30_000, tick: 0 };

function real(session: Session) {
  return toRealSession(session, 1);
}

function calm(id: string, name: string, startOffset: number, overrides: Partial<Session> = {}) {
  return real({
    ...sessionOf(id, name, { t0: SESSION_START - startOffset, ...overrides }),
    agents: [agentOf(1, { name: "Orchestrator" })],
  });
}

describe("orderSessions", () => {
  it("lists active runs with a blocked agent first, then newest first, then finished runs", () => {
    const blockedOld = real(sessionOf("blocked", "Blocked", { t0: SESSION_START - 600_000 }));
    const newer = calm("newer", "Newer", 10_000);
    const older = calm("older", "Older", 300_000);
    const finished = calm("done", "Done", 900_000, { live: false, endAt: 20 });
    const { active, past, all } = orderSessions([older, finished, newer, blockedOld], clock);
    expect(active.map((session) => session.id)).toEqual(["blocked", "newer", "older"]);
    expect(past.map((session) => session.id)).toEqual(["done"]);
    expect(all).toHaveLength(4);
  });
});

describe("attentionAlert", () => {
  it("prefers a blocked run over a failed one and ignores the open run", () => {
    const open = real(sessionOf("open", "Open"));
    const failedRun = real({
      ...sessionOf("failed", "Failed run"),
      agents: [agentOf(1, { name: "Orchestrator" }), agentOf(2, { parent: 1, start: 1, end: 5, final: "failed", returned: { summary: "x", items: [] } })],
    });
    const blockedRun = real(sessionOf("blocked", "Blocked run"));
    expect(attentionAlert([open, failedRun], open, clock)).toEqual({
      kind: "failed",
      why: "Failed run has a failed agent",
      count: 1,
    });
    expect(attentionAlert([open, failedRun, blockedRun], open, clock)).toEqual({
      kind: "blocked",
      why: "Blocked run needs you",
      count: 1,
    });
    const another = real(sessionOf("another", "Another"));
    expect(attentionAlert([open, blockedRun, another], open, clock)).toEqual({
      kind: "blocked",
      why: "2 other runs need you",
      count: 2,
    });
    expect(attentionAlert([open], open, clock)).toEqual({ kind: "none", why: "", count: 0 });
  });
});

describe("describeEntry", () => {
  it("names the blocked agents and the worst state for a live run", () => {
    const entry = describeEntry(real(sessionOf("a", "Run")), clock);
    expect(entry.worst).toBe("blocked");
    expect(entry.note).toEqual({ text: "Needs you: Security reviewer", tone: "blocked" });
    expect(entry.when).toEqual({ text: "30s", ticking: true });
  });

  it("shows the final result of a finished run and its end time", () => {
    const finished = real({
      ...sessionOf("a", "Run", { live: false, endAt: 20 }),
      agents: [
        agentOf(1, { name: "Orchestrator", end: 20, final: "failed", returned: { summary: "Stopped early", items: [] } }),
      ],
    });
    const entry = describeEntry(finished, clock);
    expect(entry.worst).toBe("failed");
    expect(entry.note).toEqual({ text: "Stopped early", tone: "failed" });
    expect(entry.when.ticking).toBe(false);
    expect(entry.when.text.startsWith("ended ")).toBe(true);
  });
});

describe("replay demo", () => {
  it("is active while it plays and past once it reaches its end", () => {
    const replay = createReplayDemo();
    const playing = { ...replay, t0: 0 };
    const during = orderSessions([playing], { clockMs: 0, tick: 10 });
    expect(during.active.map((session) => session.id)).toEqual(["research"]);
    const after = orderSessions([playing], { clockMs: 0, tick: playing.endAt + 1 });
    expect(after.past.map((session) => session.id)).toEqual(["research"]);
  });
});
