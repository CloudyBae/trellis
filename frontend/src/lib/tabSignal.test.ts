import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createReplayDemo } from "@/demo";
import { toRealSession } from "@/model";
import type { Session } from "@/api";
import type { Clock } from "./clock";
import { TAB_FAVICON, attentionSnapshot, newlySettled, signalOf, worseOf } from "./tabSignal";
import { SESSION_START, agentOf, sessionOf } from "@/test/testSupport";

const clock: Clock = { clockMs: SESSION_START + 30_000, tick: 0 };

function real(session: Session) {
  return toRealSession(session, 1);
}

function calm(id: string, overrides: Partial<Session> = {}) {
  return real({ ...sessionOf(id, id, overrides), agents: [agentOf(1, { name: "Orchestrator" })] });
}

function withFailedKid(id: string) {
  return real({
    ...sessionOf(id, id),
    agents: [
      agentOf(1, { name: "Orchestrator" }),
      agentOf(2, { parent: 1, start: 1, end: 5, final: "failed", returned: { summary: "x", items: [] } }),
    ],
  });
}

describe("attentionSnapshot", () => {
  it("flags a blocked agent in any live run", () => {
    expect(attentionSnapshot([calm("a"), real(sessionOf("b", "b"))], clock).blocked).toBe(true);
    expect(attentionSnapshot([calm("a")], clock).blocked).toBe(false);
  });

  it("ignores synthetic demo runs", () => {
    const snapshot = attentionSnapshot([createReplayDemo()], clock);
    expect(snapshot.blocked).toBe(false);
    expect(snapshot.live.size + snapshot.ended.size).toBe(0);
  });

  it("records how a finished run ended", () => {
    const failedRoot = real({
      ...sessionOf("f", "f", { live: false }),
      agents: [agentOf(1, { name: "Orchestrator", end: 20, final: "failed", returned: { summary: "x", items: [] } })],
    });
    const snapshot = attentionSnapshot([calm("d", { live: false }), failedRoot], clock);
    expect([...snapshot.ended]).toEqual([
      ["d", "done"],
      ["f", "failed"],
    ]);
  });
});

describe("newlySettled", () => {
  it("reports a run that went from live to finished", () => {
    const before = attentionSnapshot([calm("a")], clock);
    const after = attentionSnapshot([calm("a", { live: false })], clock);
    expect(newlySettled(before, after)).toBe("done");
  });

  it("reports an agent that failed in a run already being watched", () => {
    const before = attentionSnapshot([calm("a")], clock);
    expect(newlySettled(before, attentionSnapshot([withFailedKid("a")], clock))).toBe("agent-failed");
  });

  it("does not treat runs and failures that were already there as news", () => {
    const loaded = attentionSnapshot([withFailedKid("a"), calm("b", { live: false })], clock);
    const empty = attentionSnapshot([], clock);
    expect(newlySettled(empty, loaded)).toBeNull();
    expect(newlySettled(loaded, loaded)).toBeNull();
  });

  it("does not report a run that was removed", () => {
    const before = attentionSnapshot([calm("a")], clock);
    expect(newlySettled(before, attentionSnapshot([], clock))).toBeNull();
  });
});

describe("signalOf", () => {
  it("ranks blocked over a failed run over done over a failed agent", () => {
    expect(signalOf(true, "failed")).toBe("blocked");
    expect(signalOf(false, "failed")).toBe("failed");
    expect(signalOf(false, "agent-failed")).toBe("agent-failed");
    expect(signalOf(false, null)).toBe("idle");
    expect(worseOf("done", "failed")).toBe("failed");
    expect(worseOf("agent-failed", "done")).toBe("done");
    expect(worseOf("done", "agent-failed")).toBe("done");
    expect(worseOf(null, "done")).toBe("done");
  });
});

describe("favicon", () => {
  it("keeps the idle icon in step with the one in index.html", () => {
    const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
    const href = /<link rel="icon" href="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(decodeURIComponent(TAB_FAVICON.idle)).toBe(decodeURIComponent(href));
  });
});
