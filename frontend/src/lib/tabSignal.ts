import type { ModelSession } from "@/model";
import type { Clock } from "./clock";
import { isLive, summarize } from "./sessionDisplay";

export type TabSignal = "idle" | "blocked" | "failed" | "done" | "agent-failed";

export type Settled = Exclude<TabSignal, "idle" | "blocked">;

export type AttentionSnapshot = {
  blocked: boolean;
  live: ReadonlySet<string>;
  failedAgents: ReadonlyMap<string, string>;
  ended: ReadonlyMap<string, Settled>;
};

export const TAB_TITLE: Record<TabSignal, string> = {
  idle: "Trellis",
  blocked: "● Needs you · Trellis",
  failed: "✕ Run failed · Trellis",
  "agent-failed": "✕ Agent failed · Trellis",
  done: "✓ Done · Trellis",
};

const FAVICON_MARK =
  "<path d='M12 21V11.5C12 8 15.4 6.2 17.6 8.2C19.3 9.8 18.3 12.6 16 12.5C14.4 12.4 13.8 10.8 14.6 9.8' fill='none' stroke='#5EA346' stroke-width='1.7' stroke-linecap='round'/>" +
  "<path d='M12 18C12 15.2 9.4 13.4 6.5 13.8C6.5 16.6 8.8 18.3 12 18Z' fill='#6FAA58'/>";

function faviconUri(bud: { fill: string; stroke: string } | null): string {
  const circle =
    bud === null
      ? ""
      : `<circle cx='16.7' cy='17.2' r='3.6' fill='${bud.fill}' stroke='${bud.stroke}' stroke-width='1.2'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='3 3.5 18 18'>${FAVICON_MARK}${circle}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const TAB_FAVICON: Record<TabSignal, string> = {
  idle: faviconUri(null),
  blocked: faviconUri({ fill: "#E0BE5E", stroke: "#7A5C0C" }),
  failed: faviconUri({ fill: "#CF877B", stroke: "#9A4436" }),
  "agent-failed": faviconUri({ fill: "#CF877B", stroke: "#9A4436" }),
  done: faviconUri({ fill: "#A99BCF", stroke: "#5F4F93" }),
};

export function attentionSnapshot(sessions: ModelSession[], clock: Clock): AttentionSnapshot {
  const live = new Set<string>();
  const failedAgents = new Map<string, string>();
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
      } else {
        ended.set(session.id, summary.rootState === "failed" ? "failed" : "done");
      }
    });
  return { blocked, live, failedAgents, ended };
}

const URGENCY: Record<Settled, number> = { "agent-failed": 1, done: 2, failed: 3 };

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
  before.live.forEach((id) => {
    settled = worseOf(settled, after.ended.get(id) ?? null);
  });
  return settled;
}

export function signalOf(blocked: boolean, settled: Settled | null): TabSignal {
  return blocked ? "blocked" : (settled ?? "idle");
}
