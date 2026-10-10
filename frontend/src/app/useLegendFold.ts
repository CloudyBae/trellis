import { useState } from "react";

export const LEGEND_STORAGE_KEY = "trellis:legend";

const COLLAPSED = "collapsed";

function storedCollapsed(): boolean {
  try {
    return window.localStorage.getItem(LEGEND_STORAGE_KEY) === COLLAPSED;
  } catch {
    return false;
  }
}

function rememberCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) {
      window.localStorage.setItem(LEGEND_STORAGE_KEY, COLLAPSED);
    } else {
      window.localStorage.removeItem(LEGEND_STORAGE_KEY);
    }
  } catch {
    return;
  }
}

export function useLegendFold(): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = useState(storedCollapsed);

  function toggle(): void {
    const next = !collapsed;
    setCollapsed(next);
    rememberCollapsed(next);
  }

  return { collapsed, toggle };
}
