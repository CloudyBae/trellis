import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";
import ts from "typescript";

const frontendDirectory = resolve(fileURLToPath(import.meta.url), "..", "..");
const generatedFile = join(frontendDirectory, "src", "api", "generated", "schema.ts");

export function stripComments(source) {
  const sourceFile = ts.createSourceFile("schema.ts", source, ts.ScriptTarget.ES2022, true);
  const printer = ts.createPrinter({ removeComments: true });
  return printer.printFile(sourceFile);
}

async function renderTypes(schemaText) {
  const nodes = await openapiTS(JSON.parse(schemaText));
  return stripComments(astToString(nodes));
}

const argumentsList = process.argv.slice(2);
const checkOnly = argumentsList.includes("--check");
const schemaFile = argumentsList.find((argument) => argument !== "--check");

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const schemaText = schemaFile === undefined ? await readStandardInput() : readFileSync(schemaFile, "utf8");
const rendered = await renderTypes(schemaText);
if (checkOnly) {
  if (rendered !== readFileSync(generatedFile, "utf8")) {
    process.stderr.write("src/api/generated is out of date. Run npm run generate:api.\n");
    process.exit(1);
  }
} else {
  writeFileSync(generatedFile, rendered);
}
