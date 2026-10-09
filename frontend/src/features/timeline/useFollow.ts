import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { View } from "@/lib/view";
import { REDUCED_MOTION_QUERY, matchesQuery } from "@/hooks/mediaQuery";
import { gardenOf } from "./useActiveView";

const AUTO_SCROLL_MS = 700;
const FOLLOW_SLACK = 4;
const TARGET_PADDING = 24;
const SETTLED_DISTANCE = 2;

export type Follow = { follow: boolean; resume: () => void };

function visibleBottom(garden: HTMLElement): number {
  const legend = garden.querySelector<HTMLElement>(".legend");
  const covered = legend !== null && getComputedStyle(legend).position === "sticky" ? legend.offsetHeight : 0;
  return garden.getBoundingClientRect().bottom - covered;
}

export function useFollow(graphRef: RefObject<HTMLElement | null>, sessionId: string, view: View): Follow {
  const [follow, setFollow] = useState(true);
  const autoScrolling = useRef(false);
  const autoTimer = useRef<number | undefined>(undefined);
  const rendered = useRef(false);

  const followEdge = useCallback(() => {
    const garden = gardenOf(graphRef.current);
    const nowRow = graphRef.current?.querySelector<HTMLElement>(".nowrow") ?? null;
    if (garden === null || nowRow === null) {
      return;
    }
    const target = Math.max(
      0,
      garden.scrollTop + nowRow.getBoundingClientRect().bottom - visibleBottom(garden) + TARGET_PADDING,
    );
    if (Math.abs(garden.scrollTop - target) < SETTLED_DISTANCE) {
      return;
    }
    autoScrolling.current = true;
    const smooth = rendered.current && !matchesQuery(REDUCED_MOTION_QUERY);
    if (typeof garden.scrollTo === "function") {
      garden.scrollTo({ top: target, behavior: smooth ? "smooth" : "auto" });
    }
    window.clearTimeout(autoTimer.current);
    autoTimer.current = window.setTimeout(() => {
      autoScrolling.current = false;
    }, AUTO_SCROLL_MS);
  }, [graphRef]);

  const inTimeline = view === "timeline";

  useLayoutEffect(() => {
    rendered.current = false;
  }, [sessionId]);

  useLayoutEffect(() => {
    setFollow(true);
  }, [sessionId, inTimeline]);

  useLayoutEffect(() => {
    if (follow && inTimeline) {
      followEdge();
    }
    rendered.current = true;
  });

  useEffect(() => {
    const garden = gardenOf(graphRef.current);
    if (garden === null || !inTimeline) {
      return;
    }
    const onScroll = () => {
      if (autoScrolling.current) {
        return;
      }
      const nowRow = graphRef.current?.querySelector<HTMLElement>(".nowrow") ?? null;
      setFollow(nowRow === null ? true : nowRow.getBoundingClientRect().bottom <= visibleBottom(garden) + FOLLOW_SLACK);
    };
    garden.addEventListener("scroll", onScroll, { passive: true });
    return () => garden.removeEventListener("scroll", onScroll);
  }, [graphRef, inTimeline]);

  useEffect(
    () => () => {
      window.clearTimeout(autoTimer.current);
    },
    [],
  );

  const resume = useCallback(() => setFollow(true), []);
  return { follow, resume };
}
