import { useState } from "react";
import { readView, writeView } from "@/lib/view";
import type { View, ViewStorage } from "@/lib/view";

const browserStorage: ViewStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};

export function useView(): { view: View; chooseView: (next: View) => void } {
  const [view, setView] = useState<View>(() => readView(browserStorage, window.location.hash));

  function chooseView(next: View): void {
    if (next === view) {
      return;
    }
    setView(next);
    writeView(browserStorage, next);
    window.history.replaceState(null, "", `#${next}`);
  }

  return { view, chooseView };
}
