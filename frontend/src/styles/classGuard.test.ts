import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const QUOTES = ['"', "'", "`"];

function stringLiterals(source: string): string[] {
  const literals: string[] = [];
  let quote = "";
  let current = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source.charAt(index);
    if (quote === "") {
      if (QUOTES.includes(character)) {
        quote = character;
        current = "";
      }
    } else if (character === "\\") {
      index += 1;
    } else if (character === quote) {
      literals.push(current);
      quote = "";
    } else if (character === "\n" && quote !== "`") {
      quote = "";
    } else {
      current += character;
    }
  }
  return literals;
}

function wordsOf(literal: string): string[] {
  return literal
    .replaceAll("\n", " ")
    .replaceAll("\t", " ")
    .split(" ")
    .filter((word) => word !== "");
}

function forbiddenClasses(source: string): string[] {
  return stringLiterals(source)
    .flatMap(wordsOf)
    .filter((token) => token.includes("-[") || (token.startsWith("dark:") && token.length > "dark:".length));
}

function listComponents(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "api" || entry.name === "model" ? [] : listComponents(path);
    }
    const authored = entry.name.endsWith(".tsx") && !entry.name.includes(".test.") && entry.name !== "testSupport.tsx";
    return authored ? [path] : [];
  });
}

describe("class guard scanner", () => {
  it("flags arbitrary values and dark variants inside string literals only", () => {
    expect(forbiddenClasses('<div className="p-[3px] text-ink dark:bg-ink" />')).toEqual(["p-[3px]", "dark:bg-ink"]);
    expect(forbiddenClasses("const cls = `w-[2px] ${x}`;")).toEqual(["w-[2px]"]);
  });

  it("skips code outside string literals and ordinary classes", () => {
    expect(forbiddenClasses("type Props = { dark: boolean; list: number[] };")).toEqual([]);
    expect(forbiddenClasses('<div className="dark: [&_svg]:size-md text-ink" />')).toEqual([]);
  });
});

describe("authored class names", () => {
  it("use no arbitrary values and no dark variant", () => {
    const offenders = listComponents(sourceRoot).flatMap((path) =>
      forbiddenClasses(readFileSync(path, "utf8")).map((token) => `${relative(sourceRoot, path)}: ${token}`),
    );
    expect(offenders).toEqual([]);
  });
});
