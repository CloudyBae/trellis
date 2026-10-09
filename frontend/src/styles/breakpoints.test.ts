import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NARROW_QUERY } from "@/hooks/mediaQuery";
import { topLevelBlocks } from "./cssText";

const stylesDir = dirname(fileURLToPath(import.meta.url));
const read = (path: string) => readFileSync(join(stylesDir, path), "utf8");

const cssFiles = [
  "shell.css",
  "../features/tree/crumbs.css",
  "../features/tree/tree.css",
  "../features/pane/pane.css",
  "../features/timeline/timeline.css",
];

describe("900px breakpoint safeguard", () => {
  it("ensures all 900px media queries match NARROW_QUERY", () => {
    const narrowPreludesFound: string[] = [];

    for (const filePath of cssFiles) {
      const css = read(filePath);
      const blocks = topLevelBlocks(css);

      for (const block of blocks) {
        if (
          block.prelude.startsWith("@media") &&
          block.prelude.includes("900px")
        ) {
          narrowPreludesFound.push(block.prelude);
          expect(block.prelude).toBe(`@media ${NARROW_QUERY}`);
        }
      }
    }

    expect(narrowPreludesFound.length).toBeGreaterThanOrEqual(5);
  });
});
