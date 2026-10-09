import { alive, ended, layoutMetrics, stateOf, toolLeaves } from "@/model";
import type { AgentStateName, LeafState, Layout, LayoutRow, PreparedAgent } from "@/model";

export type StemPath = { key: string; d: string };
export type StemLeaf = { cx: number; cy: number; rotation: number; state: LeafState };

export type AgentStem = {
  id: number;
  x: number;
  spawnY: number;
  tipY: number;
  returnY: number | null;
  paths: StemPath[];
  leaves: StemLeaf[];
  toolTotal: number;
  state: AgentStateName;
  final: "complete" | "failed";
  glyphKey: string;
};

const FORK_RISE = 26;
const MERGE_DROP = 22;
const TIP_GAP = 6;
const LEAF_MARGIN = 24;
const LEAF_MIN_SPAN = 10;
const LEAF_MIN_STEP = 7;
const LEAF_FIRST_OFFSET = 14;
const LEAF_END_MARGIN = 8;
const LEAF_SIDE_OFFSET = 4.2;
const LEAF_TILT = -35;

type AgentRow = Extract<LayoutRow, { a: PreparedAgent }>;

function isAgentRow(row: LayoutRow): row is AgentRow {
  return row.type !== "now";
}

function leavesFor(states: LeafState[], stemX: number, spawnY: number, endY: number): StemLeaf[] {
  const span = endY - spawnY - LEAF_MARGIN;
  if (states.length === 0 || span <= LEAF_MIN_SPAN) {
    return [];
  }
  const step = Math.max(span / (states.length + 1), LEAF_MIN_STEP);
  const leaves: StemLeaf[] = [];
  states.forEach((state, index) => {
    const cy = spawnY + LEAF_FIRST_OFFSET + step * (index + 1);
    if (cy <= endY - LEAF_END_MARGIN) {
      const side = index % 2 ? -1 : 1;
      leaves.push({ cx: stemX + side * LEAF_SIDE_OFFSET, cy, rotation: side * LEAF_TILT, state });
    }
  });
  return leaves;
}

export function stemGeometry(agents: PreparedAgent[], time: number, placed: Layout, narrow: boolean): AgentStem[] {
  const metrics = layoutMetrics(narrow);
  const rowOf = new Map<string, AgentRow>();
  placed.rows.filter(isAgentRow).forEach((row) => rowOf.set(`${row.a.id}${row.type}`, row));
  const nowRow = placed.rows[placed.rows.length - 1];
  const laneX = (id: number) => metrics.x0 + (placed.lane[id] ?? Number.NaN) * metrics.lane;
  const stems: AgentStem[] = [];
  agents
    .filter((agent) => alive(agent, time))
    .forEach((agent) => {
      const spawn = rowOf.get(`${agent.id}spawn`);
      const ret = rowOf.get(`${agent.id}ret`);
      if (spawn === undefined || nowRow === undefined) {
        return;
      }
      const stemX = laneX(agent.id);
      const endY = ret ? ret.cy : nowRow.cy - TIP_GAP;
      const paths: StemPath[] = [];
      if (agent.parent != null) {
        const parentX = laneX(agent.parent);
        const rowCenterY = spawn.cy;
        paths.push({
          key: `f${agent.id}`,
          d: `M${parentX} ${rowCenterY - FORK_RISE} C${parentX} ${rowCenterY - 8} ${stemX} ${rowCenterY - 20} ${stemX} ${rowCenterY}`,
        });
      }
      paths.push({ key: `v${agent.id}`, d: `M${stemX} ${spawn.cy} L${stemX} ${endY}` });
      if (ret && agent.parent != null) {
        const parentX = laneX(agent.parent);
        const rowCenterY = ret.cy;
        paths.push({
          key: `m${agent.id}`,
          d: `M${stemX} ${rowCenterY} C${stemX} ${rowCenterY + 12} ${parentX} ${rowCenterY + 4} ${parentX} ${rowCenterY + MERGE_DROP}`,
        });
      }
      const state = stateOf(agent, time).s;
      const tools = toolLeaves(agent, time);
      stems.push({
        id: agent.id,
        x: stemX,
        spawnY: spawn.cy,
        tipY: endY,
        returnY: ret ? ret.cy : null,
        paths,
        leaves: leavesFor(tools.states, stemX, spawn.cy, endY),
        toolTotal: tools.total,
        state,
        final: agent.final ?? "complete",
        glyphKey: `n${agent.id}${state}`,
      });
    });
  return stems;
}

export function hasReturned(agents: PreparedAgent[], time: number): number[] {
  return agents.filter((agent) => alive(agent, time) && ended(agent, time)).map((agent) => agent.id);
}
