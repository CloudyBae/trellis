import type { AgentStateName, ModelSession, PreparedAgent } from "@/model";
import type { Clock } from "./clock";
import { duration } from "./format";
import { isLive, summarize } from "./sessionDisplay";

export type RunStatusKind = "needs-you" | "run-failed" | "agent-failed" | "done" | "running" | "waiting";

export type RunStatus = {
  kind: RunStatusKind;
  label: string;
  detail: string;
  glyph: AgentStateName;
  target: number | null;
  failedCalls: number;
};

function who(agents: PreparedAgent[]): string {
  const [first] = agents;
  if (first === undefined) {
    return "";
  }
  return agents.length === 1 ? first.name : `${agents.length} agents`;
}

export function runStatus(session: ModelSession, clock: Clock): RunStatus {
  const summary = summarize(session, clock);
  const [blocked] = summary.blocked;
  const [failed] = summary.failed;
  const callTarget = summary.failedCallAgent?.id ?? null;
  const { failedCalls } = summary;
  if (!isLive(session, clock)) {
    if (summary.rootState === "failed") {
      return { kind: "run-failed", label: "Run failed", detail: "", glyph: "failed", target: 1, failedCalls: 0 };
    }
    return {
      kind: "done",
      label: "Done",
      detail: `took ${duration(summary.time)}`,
      glyph: "complete",
      target: callTarget,
      failedCalls,
    };
  }
  if (blocked !== undefined) {
    return { kind: "needs-you", label: "Needs you", detail: who(summary.blocked), glyph: "blocked", target: blocked.id, failedCalls: 0 };
  }
  if (summary.rootState === "failed") {
    return { kind: "run-failed", label: "Run failed", detail: "", glyph: "failed", target: 1, failedCalls: 0 };
  }
  if (failed !== undefined) {
    return {
      kind: "agent-failed",
      label: "Agent failed",
      detail: who(summary.failed),
      glyph: "failed",
      target: failed.id,
      failedCalls: 0,
    };
  }
  if (summary.running > 0) {
    return { kind: "running", label: "Running", detail: "", glyph: "running", target: callTarget, failedCalls };
  }
  return { kind: "waiting", label: "Waiting on agents", detail: "", glyph: "waiting", target: callTarget, failedCalls };
}

export function leadText(status: RunStatus): string {
  return status.detail === "" ? status.label : `${status.label} · ${status.detail}`;
}

export function callsText(status: RunStatus): string {
  const count = status.failedCalls;
  return count === 0 ? "" : `${count} ${count === 1 ? "call" : "calls"} failed`;
}

export function statusText(status: RunStatus): string {
  const calls = callsText(status);
  return calls === "" ? leadText(status) : `${leadText(status)} · ${calls}`;
}
