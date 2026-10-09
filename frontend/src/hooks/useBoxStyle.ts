import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

export type Box = { left?: number; top?: number; width?: number; height?: number; paddingLeft?: number };

const SIDES = ["left", "top", "width", "height", "paddingLeft"] as const;

export function useBoxStyle<Element extends HTMLElement>(box: Box): RefObject<Element | null> {
  const ref = useRef<Element>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    SIDES.forEach((side) => {
      const value = box[side];
      if (value !== undefined) {
        element.style[side] = `${value}px`;
      }
    });
  });
  return ref;
}
