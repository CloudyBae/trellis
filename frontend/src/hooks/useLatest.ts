import { useLayoutEffect, useRef } from "react";

export function useLatest<Value>(value: Value): { readonly current: Value } {
  const reference = useRef(value);
  useLayoutEffect(() => {
    reference.current = value;
  }, [value]);
  return reference;
}
