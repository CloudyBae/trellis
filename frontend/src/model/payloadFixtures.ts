import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSession } from "../api";
import type { Session } from "../api";

type UnknownRecord = Record<string, unknown>;

const modelDirectory = dirname(fileURLToPath(import.meta.url));
const payloadDirectory = resolve(modelDirectory, "../../../backend/tests/payloads");
export const goldenDirectory = join(modelDirectory, "golden");

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listJsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return listJsonFiles(path);
      }
      return entry.name.endsWith(".json") ? [path] : [];
    });
}

function collectSessions(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSessions(item));
  }
  if (!isRecord(value)) {
    return [];
  }
  if (typeof value["id"] === "string" && Array.isArray(value["agents"])) {
    return [value];
  }
  const nested = value["sessions"];
  return isRecord(nested) ? Object.values(nested).flatMap((item) => collectSessions(item)) : [];
}

export type PayloadFile = { name: string; sessions: Session[] };

export function loadPayloadFiles(): PayloadFile[] {
  return listJsonFiles(payloadDirectory).flatMap((path) => {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const sessions = collectSessions(parsed).flatMap((candidate) => {
      const session = parseSession(candidate);
      return session === null ? [] : [session];
    });
    return sessions.length ? [{ name: relative(payloadDirectory, path), sessions }] : [];
  });
}

export function readGoldenLines(name: string): unknown[] {
  return readFileSync(join(goldenDirectory, "payloads", `${name}l`), "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): unknown => JSON.parse(line));
}

export function readSessionNowGolden(): unknown[] {
  return readFileSync(join(goldenDirectory, "session-now.jsonl"), "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): unknown => JSON.parse(line));
}

export { isRecord };
