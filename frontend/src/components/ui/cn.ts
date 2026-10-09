import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const mergeClasses = extendTailwindMerge({
  extend: {
    theme: {
      text: ["2xs", "xs", "caption", "note", "label", "meta", "state", "control", "item", "body", "title", "run", "mark", "display"],
      shadow: ["menu", "raised"],
      radius: ["key", "chip", "sm", "md", "lg", "popover", "round"],
      spacing: [
        "zero",
        "hair",
        "3xs",
        "2xs",
        "xs",
        "s",
        "sm",
        "m",
        "md",
        "ml",
        "lg",
        "gap",
        "icon-s",
        "icon-l",
        "control",
        "cta",
        "menu",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return mergeClasses(clsx(inputs));
}
