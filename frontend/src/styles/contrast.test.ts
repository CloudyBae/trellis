import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { blockBody, declarationsOf } from "./cssText";

const tokens = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "tokens.css"), "utf8");

const THEMES = [
  { name: "light", header: ":root {" },
  { name: "system dark", header: ':root:not([data-theme="light"]) {' },
  { name: "chosen dark", header: ':root[data-theme="dark"] {' },
];

const TEXT_PAIRS = ["ink", "ink-2", "ink-3"].flatMap((foreground) =>
  ["ground", "pane"].map((background) => ({ foreground, background, minimum: 4.5 })),
);
const FOCUS_PAIRS = ["ground", "pane"].map((background) => ({ foreground: "focus", background, minimum: 3 }));

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(1 + offset * 2, 3 + offset * 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

describe("contrast helper", () => {
  it("scores black on white at 21 and equal colors at 1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#223020", "#223020")).toBe(1);
  });
});

describe("token contrast", () => {
  THEMES.forEach(({ name, header }) => {
    const colors = declarationsOf(blockBody(tokens, header));
    [...TEXT_PAIRS, ...FOCUS_PAIRS].forEach(({ foreground, background, minimum }) => {
      it(`${name}: ${foreground} on ${background} reaches ${minimum}`, () => {
        const foregroundColor = colors.get(`--${foreground}`);
        const backgroundColor = colors.get(`--${background}`);
        expect(foregroundColor?.startsWith("#")).toBe(true);
        expect(backgroundColor?.startsWith("#")).toBe(true);
        expect(contrastRatio(foregroundColor ?? "", backgroundColor ?? "")).toBeGreaterThanOrEqual(minimum);
      });
    });
  });
});
