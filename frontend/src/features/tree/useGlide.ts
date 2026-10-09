import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { REDUCED_MOTION_QUERY, matchesQuery } from "@/hooks/mediaQuery";
import { EMPTY_HOLD, advanceGlide, createGlideMemory, holdIsEmpty, holdMovesThings } from "./glide";
import type { GlideFrame, GlideHold, GlidePlan } from "./glide";

const MOVING_CLASS_MS = 680;

export type GlideView = {
  hold: GlideHold;
  growing: ReadonlySet<number>;
  popping: ReadonlySet<number>;
  moving: boolean;
  instant: boolean;
};

export type Glide = GlideView & {
  finishGrowing: (id: number) => void;
  finishPopping: (id: number) => void;
};

const IDLE: GlideView = {
  hold: EMPTY_HOLD,
  growing: new Set(),
  popping: new Set(),
  moving: false,
  instant: false,
};

function supportsPathTransitions(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("d", 'path("M0 0")');
}

function mergeMaps<Key, Value>(older: ReadonlyMap<Key, Value>, newer: ReadonlyMap<Key, Value>): Map<Key, Value> {
  return new Map([...newer, ...older]);
}

function mergeView(current: GlideView, plan: GlidePlan): GlideView {
  return {
    hold: {
      nodes: mergeMaps(current.hold.nodes, plan.hold.nodes),
      paths: mergeMaps(current.hold.paths, plan.hold.paths),
      states: mergeMaps(current.hold.states, plan.hold.states),
      settling: new Set([...current.hold.settling, ...plan.hold.settling]),
    },
    growing: new Set([...current.growing, ...plan.growing]),
    popping: new Set([...current.popping, ...plan.popping]),
    moving: current.moving || holdMovesThings(plan.hold),
    instant: current.instant || plan.instant,
  };
}

function without(ids: ReadonlySet<number>, id: number): Set<number> {
  const remaining = new Set(ids);
  remaining.delete(id);
  return remaining;
}

export function useGlide(frame: GlideFrame, flowWidth: number | null): Glide {
  const [view, setView] = useState<GlideView>(IDLE);
  const memory = useRef(createGlideMemory());
  const frames = useRef<number[]>([]);
  const movingTimer = useRef<number | undefined>(undefined);

  const cancelFrames = useCallback(() => {
    frames.current.forEach((handle) => cancelAnimationFrame(handle));
    frames.current = [];
  }, []);

  useLayoutEffect(() => {
    if (flowWidth === null) {
      return;
    }
    const plan = advanceGlide(memory.current, frame, {
      reducedMotion: matchesQuery(REDUCED_MOTION_QUERY),
      canMovePaths: supportsPathTransitions(),
      hidden: flowWidth === 0,
    });
    if (plan.restarted) {
      cancelFrames();
      window.clearTimeout(movingTimer.current);
      setView(IDLE);
    }
    const holding = !holdIsEmpty(plan.hold) || plan.instant;
    if (!holding && plan.growing.size === 0 && plan.popping.size === 0) {
      return;
    }
    setView((current) => mergeView(current, plan));
    if (holding) {
      cancelFrames();
      const first = requestAnimationFrame(() => {
        const second = requestAnimationFrame(() => {
          frames.current = [];
          setView((current) => ({ ...current, hold: EMPTY_HOLD, instant: false }));
        });
        frames.current = [second];
      });
      frames.current = [first];
    }
    if (holdMovesThings(plan.hold)) {
      window.clearTimeout(movingTimer.current);
      movingTimer.current = window.setTimeout(() => {
        setView((current) => ({ ...current, moving: false }));
      }, MOVING_CLASS_MS);
    }
  }, [frame, flowWidth, cancelFrames]);

  useEffect(
    () => () => {
      cancelFrames();
      window.clearTimeout(movingTimer.current);
    },
    [cancelFrames],
  );

  const finishGrowing = useCallback((id: number) => {
    setView((current) => (current.growing.has(id) ? { ...current, growing: without(current.growing, id) } : current));
  }, []);
  const finishPopping = useCallback((id: number) => {
    setView((current) => (current.popping.has(id) ? { ...current, popping: without(current.popping, id) } : current));
  }, []);

  return { ...view, finishGrowing, finishPopping };
}
