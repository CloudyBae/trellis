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
});
