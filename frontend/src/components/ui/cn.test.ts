import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cn } from "./cn";

const styles = join(dirname(fileURLToPath(import.meta.url)), "../../styles");
const theme = readFileSync(join(styles, "theme.css"), "utf8");
const utilities = readFileSync(join(styles, "token-utilities.css"), "utf8");

function namesAfter(source: string, prefix: string): string[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length).split(":")[0]?.split(" ")[0] ?? "");
}

describe("cn", () => {
  it("keeps a token font size next to a text color", () => {
    expect(cn("text-caption", "text-ink")).toBe("text-caption text-ink");
  });

  it("lets a later token class replace an earlier one in its group", () => {
    expect(cn("text-caption", "text-body")).toBe("text-body");
    expect(cn("shadow-menu", "shadow-raised")).toBe("shadow-raised");
    expect(cn("px-s", "px-sm")).toBe("px-sm");
    expect(cn("rounded-md", "rounded-lg")).toBe("rounded-lg");
  });

  it("knows every token name the theme defines", () => {
    const sizes = namesAfter(utilities, "@utility text-");
    const radii = namesAfter(utilities, "@utility rounded-");
    const shadows = namesAfter(theme, "--shadow-");
    const spaces = namesAfter(theme, "--spacing-");
    expect(sizes.length).toBeGreaterThan(0);
    sizes.forEach((name) => expect(cn(`text-${name}`, "text-ink", `text-${name}`)).toBe(`text-ink text-${name}`));
    radii.forEach((name) => expect(cn("rounded-md", `rounded-${name}`)).toBe(`rounded-${name}`));
    shadows.forEach((name) => expect(cn("shadow-menu", `shadow-${name}`)).toBe(`shadow-${name}`));
    spaces.forEach((name) => expect(cn("p-s", `p-${name}`)).toBe(`p-${name}`));
  });
});
