import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import { topLevelBlocks } from "./cssText";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const tokens = readFileSync(join(frontendRoot, "src/styles/tokens.css"), "utf8");
const tailwindEntry = readFileSync(join(frontendRoot, "src/styles/tailwind.css"), "utf8");
const BUILD_TIMEOUT_MS = 60_000;
const TAILWIND_PROPERTY_HEXES = ["#0000", "#fff"];
const HEX_DIGITS = "0123456789abcdefABCDEF";

let builtCss: Promise<string> | undefined;

async function buildCss(): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), "trellis-css-"));
  try {
    await build({
      root: frontendRoot,
      logLevel: "silent",
      build: { outDir, emptyOutDir: true, cssMinify: false },
    });
    const assets = join(outDir, "assets");
    const cssFile = readdirSync(assets).find((name) => name.endsWith(".css"));
    return readFileSync(join(assets, cssFile ?? "missing.css"), "utf8");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

function loadBuiltCss(): Promise<string> {
  builtCss ??= buildCss();
  return builtCss;
}

function hexLiterals(text: string): string[] {
  const found: string[] = [];
  for (const part of text.split("#").slice(1)) {
    let length = 0;
    while (length < part.length && HEX_DIGITS.includes(part.charAt(length))) {
      length += 1;
    }
    if ([3, 4, 6, 8].includes(length)) {
      found.push(`#${part.slice(0, length)}`);
    }
  }
  return found;
}

function selfReferences(css: string): string[] {
  return css
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("--"))
    .filter((line) => {
      const name = line.slice(0, line.indexOf(":"));
      return line.slice(name.length + 1).trim().startsWith(`var(${name})`);
    });
}

function utilityBody(css: string, selector: string): string {
  const layer = topLevelBlocks(css).filter((block) => block.prelude === "@layer utilities");
  const rules = layer.flatMap((block) => topLevelBlocks(block.body));
  return rules.find((rule) => rule.prelude === selector)?.body ?? "";
}

describe("css block helper", () => {
  it("separates top-level rules from rules nested in a layer", () => {
    const blocks = topLevelBlocks("@layer a, b; @layer b { button { color: red; } } a { color: blue; }");
    expect(blocks.map((block) => block.prelude)).toEqual(["@layer b", "a"]);
    expect(blocks[0]?.body).toContain("button { color: red; }");
  });
});

describe("built stylesheet", () => {
  it("emits token values for utilities and no default palette", async () => {
    const css = await loadBuiltCss();
    expect(css).not.toContain("--color-");
    expect(css).not.toContain("--spacing:");
    expect(css).not.toContain("var(--spacing)");
    expect(selfReferences(css)).toEqual([]);
  }, BUILD_TIMEOUT_MS);

  it("maps utilities to token custom properties", async () => {
    const css = await loadBuiltCss();
    expect(utilityBody(css, ".bg-ground")).toContain("background-color: var(--ground)");
    expect(utilityBody(css, ".text-ink")).toContain("color: var(--ink)");
    expect(utilityBody(css, ".text-caption")).toContain("font-size: var(--text-caption)");
    expect(utilityBody(css, ".shadow-menu")).toContain("--tw-shadow: var(--shadow)");
  }, BUILD_TIMEOUT_MS);

  it("switches themes through the token blocks and defines no dark variant", async () => {
    const css = await loadBuiltCss();
    expect(css.split("prefers-color-scheme").length).toBe(tokens.split("prefers-color-scheme").length);
    expect(css.split('[data-theme="dark"]').length).toBe(tokens.split('[data-theme="dark"]').length);
  }, BUILD_TIMEOUT_MS);

  it("holds no hex value beyond the tokens and the Tailwind property defaults", async () => {
    const css = await loadBuiltCss();
    const allowed = new Set([...hexLiterals(tokens), ...TAILWIND_PROPERTY_HEXES]);
    expect(hexLiterals(css).filter((hex) => !allowed.has(hex))).toEqual([]);
  }, BUILD_TIMEOUT_MS);

  it("declares the base layer before the utilities layer opens", async () => {
    const css = await loadBuiltCss();
    const statement = css
      .split("\n")
      .find((line) => line.startsWith("@layer ") && line.endsWith(";") && line.includes("base"));
    const names = (statement ?? "").slice("@layer ".length, -1).split(",").map((name) => name.trim());
    expect(names).toContain("base");
    expect(names.indexOf("base")).toBeLessThan(names.indexOf("components"));
    expect(css.indexOf(statement ?? "")).toBeLessThan(css.indexOf("@layer utilities {"));
  }, BUILD_TIMEOUT_MS);

  it("leaves no unlayered element rule that could override a utility", async () => {
    const css = await loadBuiltCss();
    const unlayered = topLevelBlocks(css).filter((block) => !block.prelude.startsWith("@"));
    const wholeSelectors = unlayered.map((block) => block.prelude);
    ["button", "a", ":focus-visible"].forEach((selector) => expect(wholeSelectors).not.toContain(selector));
    const focusRules = unlayered.filter((block) => block.prelude.split(",").some((part) => part.trim() === ":focus-visible"));
    expect(focusRules.filter((block) => block.body.includes("border-radius"))).toEqual([]);
  }, BUILD_TIMEOUT_MS);

  it("keeps the element rules inside the base layer", async () => {
    const css = await loadBuiltCss();
    const baseBody = topLevelBlocks(css)
      .filter((block) => block.prelude === "@layer base")
      .map((block) => block.body)
      .join("\n");
    expect(baseBody).toContain("outline: 2px solid var(--focus)");
    expect(baseBody).toContain("font: inherit");
    expect(baseBody).toContain("color: inherit");
  }, BUILD_TIMEOUT_MS);

  it("carries no inline source proof in the Tailwind entry", () => {
    expect(tailwindEntry).not.toContain("@source inline");
  });
});
