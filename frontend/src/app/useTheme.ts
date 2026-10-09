import { useState } from "react";
import { DARK_QUERY, useMediaQuery } from "@/hooks/mediaQuery";

export const THEME_STORAGE_KEY = "trellis:theme";

type ThemeChoice = "light" | "dark";

function chosenTheme(): ThemeChoice | null {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : null;
}

function rememberTheme(next: ThemeChoice | null): void {
  try {
    if (next === null) {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    }
  } catch {
    return;
  }
}

export function useTheme(): { dark: boolean; toggle: () => void } {
  const systemDark = useMediaQuery(DARK_QUERY);
  const [choice, setChoice] = useState<ThemeChoice | null>(chosenTheme);
  const dark = choice === null ? systemDark : choice === "dark";

  function toggle(): void {
    const next: ThemeChoice = dark ? "light" : "dark";
    const followSystem = (next === "dark") === systemDark;
    if (followSystem) {
      delete document.documentElement.dataset.theme;
      setChoice(null);
      rememberTheme(null);
    } else {
      document.documentElement.dataset.theme = next;
      setChoice(next);
      rememberTheme(next);
    }
  }

  return { dark, toggle };
}
