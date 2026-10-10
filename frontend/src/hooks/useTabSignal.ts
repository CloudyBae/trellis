import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelSession } from "@/model";
import type { Clock } from "@/lib/clock";
import { TAB_FAVICON, TAB_TITLE, attentionSnapshot, newlySettled, signalOf, worseOf } from "@/lib/tabSignal";
import type { AttentionSnapshot, Settled } from "@/lib/tabSignal";

function isAway(): boolean {
  return document.hidden || !document.hasFocus();
}

function setFavicon(href: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link === null) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.append(link);
  }
  link.href = href;
}

export function useTabSignal(sessions: ModelSession[], clock: Clock): void {
  const snapshot = useMemo(() => attentionSnapshot(sessions, clock), [sessions, clock]);
  const previous = useRef<AttentionSnapshot | null>(null);
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    const arrived = previous.current === null ? null : newlySettled(previous.current, snapshot);
    previous.current = snapshot;
    if (arrived !== null && isAway()) {
      setSettled((current) => worseOf(current, arrived));
    }
  }, [snapshot]);

  useEffect(() => {
    function onReturn(): void {
      if (!isAway()) {
        setSettled(null);
      }
    }
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, []);

  const signal = signalOf(snapshot.blocked, settled);
  useEffect(() => {
    document.title = TAB_TITLE[signal];
    setFavicon(TAB_FAVICON[signal]);
  }, [signal]);
}
