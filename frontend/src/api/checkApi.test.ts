import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const generateScript = join(frontendDirectory, "scripts", "generate-api.mjs");

function runCheck(schemaFile: string): number | null {
  return spawnSync("node", [generateScript, "--check", schemaFile], { cwd: frontendDirectory }).status;
}

describe("check:api", () => {
  it("passes on the backend schema and fails on a mutated one", () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "trellis-check-api-"));
    try {
      const dumped = execFileSync(
        "uv",
        ["run", "--project", "../backend", "--directory", "../backend", "python", "-m", "trellis.cli.dump_schema"],
        {
          cwd: frontendDirectory,
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      const pristineFile = join(temporaryDirectory, "pristine.json");
      writeFileSync(pristineFile, dumped);
      expect(runCheck(pristineFile)).toBe(0);

      const mutated: unknown = JSON.parse(dumped);
      const schemas =
        typeof mutated === "object" && mutated !== null && "components" in mutated
          ? mutated.components
          : null;
      const sessionSchema =
        typeof schemas === "object" && schemas !== null && "schemas" in schemas
          ? schemas.schemas
          : null;
      if (typeof sessionSchema !== "object" || sessionSchema === null || !("Session" in sessionSchema)) {
        throw new Error("Session schema missing from dump");
      }
      const session = sessionSchema.Session;
      if (typeof session !== "object" || session === null || !("properties" in session)) {
        throw new Error("Session properties missing from dump");
      }
      const properties = session.properties;
      if (typeof properties !== "object" || properties === null) {
        throw new Error("Session properties malformed");
      }
      Reflect.deleteProperty(properties, "agents");
      const mutatedFile = join(temporaryDirectory, "mutated.json");
      writeFileSync(mutatedFile, JSON.stringify(mutated));
      expect(runCheck(mutatedFile)).toBe(1);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }, 180000);
});
