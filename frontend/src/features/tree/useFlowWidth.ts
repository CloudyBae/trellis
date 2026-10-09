import { useEffect, useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

export function useFlowWidth(flowRef: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    setWidth(flowRef.current?.clientWidth ?? 0);
  });

  useEffect(() => {
    const flow = flowRef.current;
    if (flow === null) {
      return undefined;
    }
    const measure = (): void => setWidth(flow.clientWidth);
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(flow);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [flowRef]);

  return width;
}
