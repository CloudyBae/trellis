import type { ModelSession } from "@/model";
import type { Clock } from "./clock";
import { isLive, summarize } from "./sessionDisplay";

export type TabSignal = "idle" | "blocked" | "failed" | "done" | "agent-failed" | "call-failed";

export type Settled = Exclude<TabSignal, "idle" | "blocked">;

export type AttentionSnapshot = {
  blocked: boolean;
  live: ReadonlySet<string>;
  failedAgents: ReadonlyMap<string, string>;
  failedCalls: ReadonlyMap<string, number>;
  ended: ReadonlyMap<string, Settled>;
};

export const TAB_TITLE: Record<TabSignal, string> = {
  idle: "Trellis",
  blocked: "● Needs you · Trellis",
  failed: "✕ Run failed · Trellis",
  "agent-failed": "✕ Agent failed · Trellis",
  "call-failed": "✕ Call failed · Trellis",
  done: "✓ Done · Trellis",
};

const FAVICON_MARK =
  "<g fill='none' stroke='#7C9A6A' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M11 21V13'/><path d='M11 13.2C10 8 13 5 19.4 4.8C20.2 10.8 17 14 11 13.2Z'/><path d='M11 14C10.4 10.4 8 7.8 4.6 7.8C4.4 11.8 7.2 14.6 11 14Z'/></g>";

function faviconUri(bud: { fill: string; stroke: string } | null): string {
  const circle =
    bud === null
      ? ""
      : `<circle cx='17.2' cy='18.4' r='3.2' fill='${bud.fill}' stroke='${bud.stroke}' stroke-width='1.2'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='2.65 3.5 19 19'>${FAVICON_MARK}${circle}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const TAB_FAVICON: Record<TabSignal, string> = {
  idle: faviconUri(null),
  blocked: faviconUri({ fill: "#E0BE5E", stroke: "#7A5C0C" }),
  failed: faviconUri({ fill: "#CF877B", stroke: "#9A4436" }),
  "agent-failed": faviconUri({ fill: "#CF877B", stroke: "#9A4436" }),
  "call-failed": faviconUri({ fill: "#CF877B", stroke: "#9A4436" }),
  done: faviconUri({ fill: "#A99BCF", stroke: "#5F4F93" }),
};

export function attentionSnapshot(sessions: ModelSession[], clock: Clock): AttentionSnapshot {
  const live = new Set<string>();
  const failedAgents = new Map<string, string>();
  const failedCalls = new Map<string, number>();
  const ended = new Map<string, Settled>();
  let blocked = false;
  sessions
    .filter((session) => session.real)
    .forEach((session) => {
      const summary = summarize(session, clock);
      if (isLive(session, clock)) {
        live.add(session.id);
        blocked = blocked || summary.blocked.length > 0;
        summary.failed.forEach((agent) => failedAgents.set(`${session.id}:${agent.id}`, session.id));
        failedCalls.set(session.id, summary.failedCalls);
      } else {
        ended.set(session.id, summary.rootState === "failed" ? "failed" : "done");
      }
    });
  return { blocked, live, failedAgents, failedCalls, ended };
}

const URGENCY: Record<Settled, number> = { "call-failed": 0, "agent-failed": 1, done: 2, failed: 3 };

export function worseOf(left: Settled | null, right: Settled | null): Settled | null {
  if (left === null || right === null) {
    return left ?? right;
  }
  return URGENCY[left] >= URGENCY[right] ? left : right;
}

export function newlySettled(before: AttentionSnapshot, after: AttentionSnapshot): Settled | null {
  let settled: Settled | null = null;
  after.failedAgents.forEach((sessionId, key) => {
    if (before.live.has(sessionId) && !before.failedAgents.has(key)) {
      settled = worseOf(settled, "agent-failed");
    }
  });
  after.failedCalls.forEach((count, sessionId) => {
    if (before.live.has(sessionId) && count > (before.failedCalls.get(sessionId) ?? 0)) {
      settled = worseOf(settled, "call-failed");
    }
  });
  before.live.forEach((id) => {
    settled = worseOf(settled, after.ended.get(id) ?? null);
  });
  return settled;
}

export function signalOf(blocked: boolean, settled: Settled | null): TabSignal {
  return blocked ? "blocked" : (settled ?? "idle");
}
