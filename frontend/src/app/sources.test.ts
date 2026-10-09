import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tokenFile = "styles/tokens.css";
const COLOR_FUNCTIONS = ["rgb(", "rgba(", "hsl(", "hsla("];

function findHexColors(text: string): string[] {
  return text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
}

function isAuthoredSource(path: string): boolean {
  const isMarkup = path.endsWith(".tsx") || path.endsWith(".css");
  return isMarkup && !path.includes(".test.") && !path.endsWith("testSupport.tsx");
}

function listSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "api" || entry.name === "model" ? [] : listSources(path);
    }
    return isAuthoredSource(path) ? [path] : [];
  });
}

const sources = listSources(sourceRoot).map((path) => ({
  name: relative(sourceRoot, path),
  text: readFileSync(path, "utf8"),
}));

describe("hex color scan", () => {
  it("finds colors and skips anchors and ids", () => {
    expect(findHexColors("color: #EDF1E9; fill: #fff;")).toEqual(["#EDF1E9", "#fff"]);
    expect(findHexColors('<a href="#garden"></a> <use href="#g-running" /> #root')).toEqual([]);
  });
});

describe("authored sources", () => {
  it("covers the shell, styles, demo and view components", () => {
    const names = sources.map((source) => source.name);
    expect(names).toContain("App.tsx");
    expect(names).toContain(tokenFile);
    expect(names).toContain("features/tree/TreeView.tsx");
    expect(names).toContain("features/header/RunHeader.tsx");
  });

  it("keep hex colors and color functions in the token file", () => {
    const offenders = sources
      .filter((source) => source.name !== tokenFile)
      .filter(
        (source) =>
          findHexColors(source.text).length > 0 ||
          COLOR_FUNCTIONS.some((colorFunction) => source.text.includes(colorFunction)),
      )
      .map((source) => source.name);
    expect(offenders).toEqual([]);
  });

  it("never reference a network host", () => {
    const offenders = sources.filter((source) => source.text.includes("http")).map((source) => source.name);
    expect(offenders).toEqual([]);
  });

  it("set no inline styles in components", () => {
    const offenders = sources
      .filter((source) => source.name.endsWith(".tsx") && source.text.includes("style="))
      .map((source) => source.name);
    expect(offenders).toEqual([]);
  });

  it("declare no font faces of their own and import fonts only from @fontsource", () => {
    const declaringFaces = sources.filter((source) => source.text.includes("@font-face"));
    expect(declaringFaces.map((source) => source.name)).toEqual([]);
    const fontImports = sources.flatMap((source) =>
      source.text.split("\n").filter((line) => line.includes("font") && line.startsWith("import ")),
    );
    expect(fontImports.length).toBeGreaterThan(0);
    fontImports.forEach((line) => expect(line).toContain('"@fontsource/'));
  });
});
