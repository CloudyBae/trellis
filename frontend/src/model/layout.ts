import { alive, ended } from "./agents";
import type { Layout, LayoutEventType, LayoutMetrics, LayoutRow, PreparedAgent } from "./types";

export const NOW_ROW_HEIGHT = 52;
export const CHIPS_HEIGHT = 30;

const WIDE_METRICS: LayoutMetrics = { lane: 20, x0: 26, spawnHeight: 60, returnHeight: 38 };
const NARROW_METRICS: LayoutMetrics = { lane: 13, x0: 16, spawnHeight: 84, returnHeight: 60 };

export function layoutMetrics(narrow: boolean): LayoutMetrics {
  return narrow ? NARROW_METRICS : WIDE_METRICS;
}

type LayoutEvent = { type: LayoutEventType; a: PreparedAgent; t: number };

export function layout(
  agents: PreparedAgent[],
  time: number,
  narrow: boolean,
  selected: number | null,
): Layout {
  const metrics = layoutMetrics(narrow);
  const events: LayoutEvent[] = [];
  agents.forEach((agent) => {
    if (!alive(agent, time)) {
      return;
    }
    events.push({ type: "spawn", a: agent, t: agent.start });
    if (ended(agent, time) && agent.end != null) {
      events.push({ type: "ret", a: agent, t: agent.end });
    }
  });
  events.sort(
    (left, right) =>
      left.t - right.t || (left.type === "spawn" ? -1 : 1) || left.a.id - right.a.id,
  );

  const lane: Record<number, number> = {};
  const busy = new Map<number, boolean>();
  let rowTop = 8;
  let maxLane = 0;
  const rows: LayoutRow[] = [];
  events.forEach((event) => {
    const spawnHeight =
      metrics.spawnHeight + (event.a.id === selected && event.a.context.length ? CHIPS_HEIGHT : 0);
    const height = event.type === "spawn" ? spawnHeight : metrics.returnHeight;
    if (event.type === "spawn") {
      let slot = event.a.parent ? (lane[event.a.parent] ?? NaN) + 1 : 0;
      while (Number.isFinite(slot) && busy.get(slot)) {
        slot++;
      }
      busy.set(slot, true);
      lane[event.a.id] = slot;
      maxLane = Math.max(maxLane, slot);
    }
    rows.push({ ...event, y: rowTop, h: height, cy: rowTop + height / 2 });
    rowTop += height;
    if (event.type === "ret") {
      busy.set(lane[event.a.id] ?? NaN, false);
    }
  });
  rows.push({ type: "now", y: rowTop, h: NOW_ROW_HEIGHT, cy: rowTop + NOW_ROW_HEIGHT / 2 });
  rowTop += NOW_ROW_HEIGHT;
  return { rows, lane, height: rowTop, textX: metrics.x0 + maxLane * metrics.lane + 30, maxLane };
}
