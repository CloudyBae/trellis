import { describe, expect, it } from "vitest";
import { toRealSession } from "@/model";
import type { Session } from "@/api";
import type { Clock } from "./clock";
import { runStatus, statusText } from "./runStatus";
import { SESSION_START, agentOf, sessionOf } from "@/test/testSupport";

const clock: Clock = { clockMs: SESSION_START + 30_000, tick: 0 };

function status(session: Session) {
  return runStatus(toRealSession(session, 1), clock);
}

const failedKid = agentOf(2, { name: "Test writer", parent: 1, start: 1, end: 5, final: "failed", returned: { summary: "x", items: [] } });

const failedRead = { at: 6, kind: "tool" as const, name: "Read", target: "missing.txt", out: "File does not exist.", fail: true };

function withFailedCall(overrides: { live?: boolean } = {}) {
  return {
    ...sessionOf("a", "Run", overrides),
    agents: [
      overrides.live === false
        ? agentOf(1, { name: "Orchestrator", end: 20, final: "complete" })
        : agentOf(1, { name: "Orchestrator", phases: [{ at: 1, state: "waiting", note: "Waiting on agents." }] }),
      agentOf(2, { name: "Explorer", parent: 1, start: 1, end: 9, final: "complete", returned: { summary: "FAILED", items: [] }, turns: [failedRead] }),
    ],
  };
}

describe("runStatus", () => {
  it("asks for you first and names the blocked agent", () => {
    const result = status(sessionOf("a", "Run"));
    expect(result).toMatchObject({ kind: "needs-you", glyph: "blocked", target: 3 });
    expect(statusText(result)).toBe("Needs you · Security reviewer");
  });

  it("counts several blocked agents instead of listing them", () => {
    const base = sessionOf("a", "Run");
    const second = agentOf(5, { name: "Docs writer", parent: 1, start: 12, phases: [{ at: 15, state: "blocked", note: "x" }] });
    const result = status({ ...base, agents: [...base.agents, second] });
    expect(statusText(result)).toBe("Needs you · 2 agents");
  });

  it("calls a failed subagent an agent failure while the run goes on", () => {
    const result = status({ ...sessionOf("a", "Run"), agents: [agentOf(1, { name: "Orchestrator" }), failedKid] });
    expect(result).toMatchObject({ kind: "agent-failed", target: 2 });
    expect(statusText(result)).toBe("Agent failed · Test writer");
  });

  it("reports a quiet running or waiting run", () => {
    expect(status({ ...sessionOf("a", "Run"), agents: [agentOf(1, { name: "Orchestrator" })] }).kind).toBe("running");
    const waiting = status({
      ...sessionOf("a", "Run"),
      agents: [agentOf(1, { name: "Orchestrator" }), agentOf(2, { parent: 1, start: 1, phases: [{ at: 1, state: "waiting", note: "Queued." }] })],
    });
    expect(waiting.kind).toBe("waiting");
  });

  it("settles a finished run as Done with its duration, or as a failed run", () => {
    const done = status({ ...sessionOf("a", "Run"), live: false, agents: [agentOf(1, { name: "Orchestrator", end: 20, final: "complete" })] });
    expect(done).toMatchObject({ kind: "done", glyph: "complete", target: null });
    expect(done.detail).toMatch(/^took /);
    const failed = status({
      ...sessionOf("a", "Run"),
      live: false,
      agents: [agentOf(1, { name: "Orchestrator", end: 20, final: "failed", returned: { summary: "x", items: [] } })],
    });
    expect(failed).toMatchObject({ kind: "run-failed", label: "Run failed", target: 1 });
  });

  it("keeps a failed call visible when the agent that hit it still finished", () => {
    const result = status(withFailedCall());
    expect(result).toMatchObject({ kind: "waiting", failedCalls: 1, target: 2 });
    expect(statusText(result)).toBe("Waiting on agents · 1 call failed");
  });

  it("carries the failed calls into a finished run", () => {
    const result = status(withFailedCall({ live: false }));
    expect(result).toMatchObject({ kind: "done", failedCalls: 1, target: 2 });
    expect(statusText(result)).toMatch(/^Done · took .+ · 1 call failed$/);
  });

  it("leaves failed calls out once an agent failure already says so", () => {
    const base = withFailedCall();
    const result = status({ ...base, agents: [...base.agents, failedKid] });
    expect(result).toMatchObject({ kind: "agent-failed", failedCalls: 0 });
  });
});
