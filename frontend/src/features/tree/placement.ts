import { alive, ancestry, kidsOf, toolLeaves as toolLeafStates } from "@/model";
import type { LeafState, PreparedAgent } from "@/model";

export const POD_SIZE = 58;
export const ROOT_ID = 1;
export const MIN_AVAILABLE_WIDTH = 300;
export const FLOW_SIDE_ALLOWANCE = 8;

export const DEFAULT_LABEL_RESERVE = 150;
export const DEFAULT_ROOT_LABEL_RESERVE = 108;
export const WIDE_COLUMN_WIDTH = 152;
export const NARROW_COLUMN_WIDTH = 132;
export const ROOT_LABEL_MAX_WIDTH = 460;

const WIRE_HEIGHT = 20;
const DROP_HEIGHT = 60;
const EDGE_PADDING = 16;
const TIER_GAP = 30;
const FOLD_LABEL_HEIGHT = 60;
export const FOLD_EDGE_ID = 0;

export type PlacementInput = {
  agents: PreparedAgent[];
  time: number;
  narrow: boolean;
  selectedId: number | null;
  flowWidth: number;
  foldEarlier: boolean;
  labelReserve: number;
  rootLabelReserve: number;
};

export type NodePlacement = {
  id: number;
  left: number;
  top: number;
  width: number;
  root: boolean;
};

export type ToolLeaf = { x: number; y: number; rotation: number; state: LeafState };

export type EdgePlacement = {
  id: number;
  parentId: number;
  path: string;
  wireY: number;
  lit: boolean;
  leaves: ToolLeaf[];
  toolTotal: number;
};

export type FoldPlacement = { left: number; top: number; width: number; count: number };

export type TreePlacement = {
  nodes: NodePlacement[];
  fold: FoldPlacement | null;
  edges: EdgePlacement[];
  width: number;
  height: number;
  availableWidth: number;
};

type Slot = { centerX: number; top: number };

function liveKids(agent: PreparedAgent, time: number): PreparedAgent[] {
  return agent.kids.flatMap((id) => {
    const kid = agent.by[id];
    return kid !== undefined && alive(kid, time) ? [kid] : [];
  });
}

export function latestPromptAt(root: PreparedAgent, time: number): number {
  return root.turns.reduce(
    (latest, turn) => (turn.kind === "user" && turn.at <= time ? Math.max(latest, turn.at) : latest),
    -Infinity,
  );
}

function subtreeSize(agent: PreparedAgent): number {
  return 1 + kidsOf(agent).reduce((sum, kid) => sum + subtreeSize(kid), 0);
}

function routePath(startX: number, startY: number, wireY: number, endX: number, endY: number): string {
  if (Math.abs(endX - startX) < 1) {
    return `M${startX} ${startY} L${startX} ${endY}`;
  }
  const direction = Math.sign(endX - startX);
  return (
    `M${startX} ${startY} L${startX} ${wireY - 10} Q${startX} ${wireY} ${startX + direction * 10} ${wireY}` +
    ` L${endX - direction * 12} ${wireY} Q${endX} ${wireY} ${endX} ${wireY + 12} L${endX} ${endY}`
  );
}

function toolLeaves(states: LeafState[], centerX: number, wireY: number, endY: number): ToolLeaf[] {
  const count = states.length;
  const top = wireY + 18;
  const span = endY - top - 4;
  return states.map((state, index) => ({
    x: centerX,
    y: Number((top + (span * (index + 0.5)) / count).toFixed(1)),
    rotation: index % 2 ? -38 : -142,
    state,
  }));
}

export function columnWidthFor(narrow: boolean): number {
  return narrow ? NARROW_COLUMN_WIDTH : WIDE_COLUMN_WIDTH;
}

export function availableWidthFor(flowWidth: number): number {
  return Math.max(flowWidth - FLOW_SIDE_ALLOWANCE, MIN_AVAILABLE_WIDTH);
}

export function rootLabelWidthFor(flowWidth: number): number {
  return Math.min(availableWidthFor(flowWidth) - EDGE_PADDING, ROOT_LABEL_MAX_WIDTH);
}

function trailingEdge(cursor: number, availableWidth: number): number {
  return cursor > availableWidth ? cursor + EDGE_PADDING : availableWidth;
}

function emptyPlacement(availableWidth: number): TreePlacement {
  return { nodes: [], fold: null, edges: [], width: availableWidth, height: 0, availableWidth };
}

export function placeTree(input: PlacementInput): TreePlacement {
  const { agents, time, narrow, selectedId, labelReserve, rootLabelReserve } = input;
  const availableWidth = availableWidthFor(input.flowWidth);
  const rowHeight = POD_SIZE + labelReserve + WIRE_HEIGHT + DROP_HEIGHT;
  const root = agents.find((agent) => agent.id === ROOT_ID);
  if (root === undefined || !alive(root, time)) {
    return emptyPlacement(availableWidth);
  }

  const columnWidth = columnWidthFor(narrow);
  const widths = new Map<number, number>();
  const levels = new Map<number, number>();

  function widthOf(agent: PreparedAgent): number {
    const known = widths.get(agent.id);
    if (known !== undefined) {
      return known;
    }
    const total = liveKids(agent, time).reduce((sum, kid) => sum + widthOf(kid), 0);
    const width = Math.max(columnWidth, total);
    widths.set(agent.id, width);
    return width;
  }

  function levelsOf(agent: PreparedAgent): number {
    const known = levels.get(agent.id);
    if (known !== undefined) {
      return known;
    }
    const count = 1 + Math.max(0, ...liveKids(agent, time).map(levelsOf));
    levels.set(agent.id, count);
    return count;
  }

  const slots = new Map<number, Slot>();

  function place(agent: PreparedAgent, left: number, top: number): void {
    const kids = liveKids(agent, time);
    const width = widthOf(agent);
    if (kids.length === 0) {
      slots.set(agent.id, { centerX: left + width / 2, top });
      return;
    }
    let cursor = left + (width - kids.reduce((sum, kid) => sum + widthOf(kid), 0)) / 2;
    kids.forEach((kid) => {
      place(kid, cursor, top + rowHeight);
      cursor += widthOf(kid);
    });
    const firstKid = slots.get(kids[0]?.id ?? -1);
    const lastKid = slots.get(kids[kids.length - 1]?.id ?? -1);
    if (firstKid !== undefined && lastKid !== undefined) {
      slots.set(agent.id, { centerX: (firstKid.centerX + lastKid.centerX) / 2, top });
    }
  }

  const postX = EDGE_PADDING + POD_SIZE / 2;
  const firstColumnX = postX + 18;
  const rootBottom = EDGE_PADDING + POD_SIZE;
  const wireOf = new Map<number, number>();
  let wireY = Math.max(rootBottom, EDGE_PADDING + rootLabelReserve) + 34;
  let cursor = firstColumnX;
  let tierBottom = wireY;
  let contentWidth = availableWidth;

  const keptIds = selectedId === null ? new Set<number>() : ancestry(root.by, selectedId);
  const promptAt = latestPromptAt(root, time);
  const rootKids = liveKids(root, time);
  const earlierKids = input.foldEarlier
    ? rootKids.filter((kid) => kid.end != null && kid.end <= promptAt && !keptIds.has(kid.id))
    : [];
  const currentKids = rootKids.filter((kid) => !earlierKids.includes(kid));
  let fold: FoldPlacement | null = null;
  let foldEdge: EdgePlacement | null = null;
  if (earlierKids.length > 0) {
    const foldTop = wireY + DROP_HEIGHT;
    fold = {
      left: cursor,
      top: foldTop,
      width: columnWidth,
      count: earlierKids.reduce((sum, kid) => sum + subtreeSize(kid), 0),
    };
    foldEdge = {
      id: FOLD_EDGE_ID,
      parentId: root.id,
      path: routePath(postX, rootBottom + 6, wireY, cursor + columnWidth / 2, foldTop - 8),
      wireY,
      lit: false,
      leaves: [],
      toolTotal: 0,
    };
    cursor += columnWidth;
    contentWidth = Math.max(contentWidth, trailingEdge(cursor, availableWidth));
    tierBottom = Math.max(tierBottom, foldTop + POD_SIZE + FOLD_LABEL_HEIGHT);
  }

  currentKids.forEach((kid) => {
    const width = widthOf(kid);
    if (cursor + width > availableWidth && cursor > firstColumnX) {
      wireY = tierBottom + TIER_GAP;
      cursor = firstColumnX;
    }
    place(kid, cursor, wireY + DROP_HEIGHT);
    wireOf.set(kid.id, wireY);
    cursor += width;
    contentWidth = Math.max(contentWidth, trailingEdge(cursor, availableWidth));
    tierBottom = Math.max(tierBottom, wireY + DROP_HEIGHT + (levelsOf(kid) - 1) * rowHeight + POD_SIZE + labelReserve);
  });

  const rootSlot: Slot = { centerX: postX, top: EDGE_PADDING };
  slots.set(root.id, rootSlot);

  const nodes = agents.flatMap((agent): NodePlacement[] => {
    const slot = slots.get(agent.id);
    if (slot === undefined || !alive(agent, time)) {
      return [];
    }
    if (agent.id === root.id) {
      return [
        {
          id: agent.id,
          left: EDGE_PADDING,
          top: EDGE_PADDING,
          width: rootLabelWidthFor(input.flowWidth),
          root: true,
        },
      ];
    }
    return [{ id: agent.id, left: slot.centerX - columnWidth / 2, top: slot.top, width: columnWidth, root: false }];
  });

  const litIds = keptIds;
  const edges = agents.flatMap((agent): EdgePlacement[] => {
    if (!alive(agent, time) || !agent.parent) {
      return [];
    }
    const parentSlot = slots.get(agent.parent);
    const slot = slots.get(agent.id);
    if (parentSlot === undefined || slot === undefined) {
      return [];
    }
    const isRootKid = agent.parent === root.id;
    const startY = isRootKid ? rootBottom + 6 : parentSlot.top + POD_SIZE + labelReserve + 4;
    const edgeWireY = isRootKid ? (wireOf.get(agent.id) ?? slot.top - DROP_HEIGHT) : slot.top - DROP_HEIGHT + 4;
    const endY = slot.top - 8;
    const tools = toolLeafStates(agent, time);
    return [
      {
        id: agent.id,
        parentId: agent.parent,
        path: routePath(parentSlot.centerX, startY, edgeWireY, slot.centerX, endY),
        wireY: edgeWireY,
        lit: litIds.has(agent.id),
        leaves: toolLeaves(tools.states, slot.centerX, edgeWireY, endY),
        toolTotal: tools.total,
      },
    ];
  });

  return {
    nodes,
    fold,
    edges: [
      ...(foldEdge === null ? [] : [foldEdge]),
      ...edges.filter((edge) => !edge.lit),
      ...edges.filter((edge) => edge.lit),
    ],
    width: contentWidth,
    height: tierBottom + EDGE_PADDING,
    availableWidth,
  };
}
