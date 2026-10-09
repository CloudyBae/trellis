import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { REDUCED_MOTION_QUERY, matchesQuery } from "@/hooks/mediaQuery";

export type MotionMarks = { stemKeys: string[]; glyphKeys: string[]; returnedIds: number[] };

export type StemMotion = {
  growing: ReadonlySet<string>;
  popping: ReadonlySet<string>;
  settledIds: ReadonlySet<number>;
  finishGrowing: (key: string) => void;
  finishPopping: (key: string) => void;
};

type MotionView = { growing: ReadonlySet<string>; popping: ReadonlySet<string>; settledIds: ReadonlySet<number> };

type Memory = {
  rendered: boolean;
  seenKeys: Set<string>;
  seenReturned: Set<number>;
  pendingSettle: Set<number>;
};

const IDLE: MotionView = { growing: new Set(), popping: new Set(), settledIds: new Set() };

function union<Item>(older: ReadonlySet<Item>, newer: Iterable<Item>): Set<Item> {
  return new Set([...older, ...newer]);
}

function without<Item>(items: ReadonlySet<Item>, item: Item): Set<Item> {
  const remaining = new Set(items);
  remaining.delete(item);
  return remaining;
}

function freshKeys(seen: Set<string>, keys: string[]): string[] {
  const fresh = keys.filter((key) => !seen.has(key));
  fresh.forEach((key) => seen.add(key));
  return fresh;
}

export function useStemMotion(marks: MotionMarks, active: boolean): StemMotion {
  const [view, setView] = useState<MotionView>(IDLE);
  const memory = useRef<Memory>({
    rendered: false,
    seenKeys: new Set(),
    seenReturned: new Set(),
    pendingSettle: new Set(),
  });
  const frames = useRef<number[]>([]);
  const signature = [marks.stemKeys.join(), marks.glyphKeys.join(), marks.returnedIds.join()].join("|");

  useLayoutEffect(() => {
    const state = memory.current;
    const animated = state.rendered && !matchesQuery(REDUCED_MOTION_QUERY);
    state.rendered = true;
    const growing = freshKeys(state.seenKeys, marks.stemKeys);
    const popping = freshKeys(state.seenKeys, marks.glyphKeys);
    const newlyReturned = marks.returnedIds.filter((id) => !state.seenReturned.has(id));
    newlyReturned.forEach((id) => state.seenReturned.add(id));
    const settleLater = animated ? newlyReturned : [];
    const immediate = animated ? [] : newlyReturned;
    const stemKeys = new Set(marks.stemKeys);
    const glyphKeys = new Set(marks.glyphKeys);
    setView((current) => {
      const addGrowing = animated && active ? growing : [];
      const addPopping = animated && active ? popping : [];
      const nextGrowing = new Set([...current.growing, ...addGrowing].filter((key) => stemKeys.has(key)));
      const nextPopping = new Set([...current.popping, ...addPopping].filter((key) => glyphKeys.has(key)));
      if (nextGrowing.size === current.growing.size && nextPopping.size === current.popping.size && addGrowing.length + addPopping.length === 0) {
        return current;
      }
      return { ...current, growing: nextGrowing, popping: nextPopping };
    });
    if (immediate.length > 0) {
      setView((current) => ({ ...current, settledIds: union(current.settledIds, immediate) }));
    }
    if (settleLater.length > 0) {
      settleLater.forEach((id) => state.pendingSettle.add(id));
      frames.current.forEach((handle) => cancelAnimationFrame(handle));
      const first = requestAnimationFrame(() => {
        const second = requestAnimationFrame(() => {
          frames.current = [];
          const ids = [...state.pendingSettle];
          state.pendingSettle.clear();
          setView((current) => ({ ...current, settledIds: union(current.settledIds, ids) }));
        });
        frames.current = [second];
      });
      frames.current = [first];
    }
  }, [signature]);

  useLayoutEffect(() => {
    if (!active) {
      setView((current) =>
        current.growing.size + current.popping.size === 0
          ? current
          : { ...current, growing: new Set(), popping: new Set() },
      );
    }
  }, [active]);

  useEffect(
    () => () => {
      frames.current.forEach((handle) => cancelAnimationFrame(handle));
      frames.current = [];
    },
    [],
  );

  const finishGrowing = useCallback((key: string) => {
    setView((current) => (current.growing.has(key) ? { ...current, growing: without(current.growing, key) } : current));
  }, []);
  const finishPopping = useCallback((key: string) => {
    setView((current) => (current.popping.has(key) ? { ...current, popping: without(current.popping, key) } : current));
  }, []);

  return { ...view, finishGrowing, finishPopping };
}
