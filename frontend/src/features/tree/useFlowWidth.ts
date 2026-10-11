import { useEffect, useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

function contentWidthOf(flow: HTMLElement): number {
  if (flow.clientWidth === 0) {
    return 0;
  }
  const style = window.getComputedStyle(flow);
  const padding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  return Math.max(flow.clientWidth - padding, 0);
}

export function useFlowWidth(flowRef: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const flow = flowRef.current;
    setWidth(flow === null ? 0 : contentWidthOf(flow));
  });

  useEffect(() => {
    const flow = flowRef.current;
    if (flow === null) {
      return undefined;
    }
    const measure = (): void => setWidth(contentWidthOf(flow));
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
