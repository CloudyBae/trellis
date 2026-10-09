import { useEffect, useState } from "react";
import type { Clock } from "@/lib/clock";

const TICK_MS = 1000;

export function useClock(): Clock {
  const [clock, setClock] = useState<Clock>(() => ({ clockMs: Date.now(), tick: 0 }));
  useEffect(() => {
    const timer = setInterval(() => {
      setClock((previous) => ({ clockMs: Date.now(), tick: previous.tick + 1 }));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return clock;
}
