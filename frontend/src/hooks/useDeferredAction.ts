import { useEffect, useRef } from "react";

export function useDeferredAction(): (action: () => void) => void {
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    const action = pending.current;
    pending.current = null;
    action?.();
  });
  return (action) => {
    pending.current = action;
  };
}
