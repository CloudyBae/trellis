import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { topLevelBlocks } from "./cssText";

const styles = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(styles, path), "utf8");
const shell = topLevelBlocks(read("shell.css"));
const base = topLevelBlocks(read("base.css"));
const pane = topLevelBlocks(read("../features/pane/pane.css"));

const MIGRATED_SELECTORS = [
  ".empty",
  ".empty-in",
  ".empty h1",
  ".empty p",
  ".empty .empty-note",
  ".btn",
  ".btn:hover",
  ".mark",
  ".mark svg",
  ".run",
  ".run-name",
  ".run-meta",
  ".run-line",
  ".runswitch",
  ".runswitch:hover",
  '.runswitch[aria-expanded="true"]',
  ".runswitch .chev-down",
  '.runswitch[aria-expanded="true"] .chev-down',
  ".alert-dot",
  ".alert-dot.failed",
  ".replay",
  ".replay:hover",
  ".demo",
  ".menu",
  ".menu h2",
  ".menu h2:first-child",
  ".menu ul",
  ".sess",
  ".sess:hover",
  '.sess[aria-checked="true"]',
  ".sess > svg",
  ".s-name",
  ".s-when",
  ".s-meta",
  ".s-note",
  ".s-note.blocked",
  ".s-note.failed",
  ".sess.past .s-name",
  ".s-foot",
  ".counts",
  ".count",
  ".count:hover",
  ".count:disabled",
  ".count:disabled:hover",
  ".count svg",
  ".count b",
  ".count span",
  ".views",
  ".views button",
  ".views button:hover",
  '.views button[aria-pressed="true"]',
  ".theme-toggle",
  ".theme-toggle:hover",
  ".theme-toggle svg",
  ".theme-toggle .i-moon",
  '.theme-toggle[data-dark="true"] .i-sun',
  '.theme-toggle[data-dark="true"] .i-moon',
  ".legend span",
  ".legend svg",
  ".legend .brk",
  ".legend .keys",
  ".legend .legend-note",
  ".legend kbd",
  ".vh",
  ".more summary",
  ".more summary::-webkit-details-marker",
];

function topLevelSelectors(blocks: ReturnType<typeof topLevelBlocks>): string[] {
  return blocks
    .filter((block) => !block.prelude.startsWith("@"))
    .flatMap((block) => block.prelude.split(",").map((selector) => selector.trim()));
}

describe("migrated widget rules", () => {
  it("are gone from the top level of the hand stylesheets", () => {
    const present = new Set([...topLevelSelectors(shell), ...topLevelSelectors(base), ...topLevelSelectors(pane)]);
    expect(MIGRATED_SELECTORS.filter((selector) => present.has(selector))).toEqual([]);
  });

  it("leave no fixed-position menu rule in the shell stylesheet", () => {
    const menuRules = shell.flatMap((block) =>
      block.prelude.startsWith("@") ? topLevelBlocks(block.body) : [block],
    );
    expect(menuRules.filter((rule) => rule.prelude.startsWith(".menu"))).toEqual([]);
    expect(read("shell.css")).not.toContain("position: fixed");
  });

  it("keeps the legend positioning that the follow logic reads", () => {
    const legend = shell.find((block) => block.prelude === ".legend");
    expect(legend?.body).toContain("position: sticky");
    expect(legend?.body).toContain("bottom: 0");
    expect(legend?.body).toContain("z-index");
    expect(legend?.body).toContain("margin-top: auto");
    const narrow = shell.find((block) => block.prelude === "@media (max-width: 900px)");
    const narrowLegend = topLevelBlocks(narrow?.body ?? "").find((rule) => rule.prelude === ".legend");
    expect(narrowLegend?.body).toContain("position: static");
  });

  it("keeps the shell and pane element rules in the base layer", () => {
    const layer = base.find((block) => block.prelude === "@layer base");
    const selectors = topLevelBlocks(layer?.body ?? "").map((rule) => rule.prelude);
    expect(selectors).toEqual([":focus-visible", "button", "a"]);
    expect(topLevelSelectors(base)).not.toContain("button");
  });
});
