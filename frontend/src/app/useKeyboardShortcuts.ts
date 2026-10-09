import { useEffect } from "react";
import { handleShortcut } from "./shortcuts";
import type { ShortcutContext } from "./shortcuts";
import { useLatest } from "@/hooks/useLatest";

export function useKeyboardShortcuts(context: ShortcutContext): void {
  const latest = useLatest(context);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleShortcut(event, latest.current);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [latest]);
}
