import type { AgentStateName } from "@/model";

export type Position = { left: number; top: number };

export type GlideFrame = {
  sessionId: string;
  availableWidth: number;
  nodes: ReadonlyMap<number, Position>;
  paths: ReadonlyMap<number, string>;
  states: ReadonlyMap<number, AgentStateName>;
  endedEdges: ReadonlySet<number>;
};

export type GlideHold = {
  nodes: ReadonlyMap<number, Position>;
  paths: ReadonlyMap<number, string>;
  states: ReadonlyMap<number, AgentStateName>;
  settling: ReadonlySet<number>;
};

export type GlideMemory = {
  frame: GlideFrame | null;
  seen: Set<string>;
  settledEdges: Set<number>;
};

export type GlideOptions = { reducedMotion: boolean; canMovePaths: boolean; hidden: boolean };

export type GlidePlan = {
  hold: GlideHold;
  growing: Set<number>;
  popping: Set<number>;
  restarted: boolean;
  instant: boolean;
};

const MOVE_THRESHOLD = 0.5;

export const EMPTY_HOLD: GlideHold = {
  nodes: new Map(),
  paths: new Map(),
  states: new Map(),
  settling: new Set(),
};

export function createGlideMemory(): GlideMemory {
  return { frame: null, seen: new Set(), settledEdges: new Set() };
}

export function holdMovesThings(hold: GlideHold): boolean {
  return hold.nodes.size > 0 || hold.paths.size > 0;
}

export function holdIsEmpty(hold: GlideHold): boolean {
  return !holdMovesThings(hold) && hold.states.size === 0 && hold.settling.size === 0;
}

export function advanceGlide(memory: GlideMemory, frame: GlideFrame, options: GlideOptions): GlidePlan {
  const restarted = memory.frame === null || memory.frame.sessionId !== frame.sessionId;
  if (restarted) {
    memory.seen.clear();
    memory.settledEdges.clear();
    memory.frame = null;
  }
  const previous = memory.frame;
  const resized = previous !== null && previous.availableWidth !== frame.availableWidth;
  const animated = previous !== null && !options.reducedMotion && !options.hidden;
  const gliding = animated && !resized;

  const growing = new Set<number>();
  frame.paths.forEach((_, id) => {
    const key = `F${id}`;
    if (!memory.seen.has(key)) {
      memory.seen.add(key);
      if (animated) {
        growing.add(id);
      }
    }
  });
  const popping = new Set<number>();
  frame.nodes.forEach((_, id) => {
    const key = `P${id}`;
    if (!memory.seen.has(key)) {
      memory.seen.add(key);
      if (animated) {
        popping.add(id);
      }
    }
  });

  const nodes = new Map<number, Position>();
  const paths = new Map<number, string>();
  const states = new Map<number, AgentStateName>();
  const settling = new Set<number>();
  let jumped = false;
  if (previous !== null && gliding) {
    frame.nodes.forEach((position, id) => {
      const before = previous.nodes.get(id);
      const moved =
        before !== undefined &&
        (Math.abs(before.left - position.left) > MOVE_THRESHOLD || Math.abs(before.top - position.top) > MOVE_THRESHOLD);
      if (before !== undefined && moved) {
        jumped = true;
        if (options.canMovePaths) {
          nodes.set(id, before);
        }
      }
    });
    frame.paths.forEach((path, id) => {
      const before = previous.paths.get(id);
      if (before !== undefined && before !== path && options.canMovePaths) {
        paths.set(id, before);
      }
    });
    frame.states.forEach((state, id) => {
      const before = previous.states.get(id);
      if (before !== undefined && before !== state) {
        states.set(id, before);
      }
    });
  }
  frame.endedEdges.forEach((id) => {
    if (animated && !memory.settledEdges.has(id)) {
      settling.add(id);
    }
    memory.settledEdges.add(id);
  });

  memory.frame = frame;
  return { hold: { nodes, paths, states, settling }, growing, popping, restarted, instant: resized || (jumped && !options.canMovePaths) };
}
