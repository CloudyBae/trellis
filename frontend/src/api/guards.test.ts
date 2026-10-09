import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseHello, parseRemove, parseSession } from "./guards";

type UnknownRecord = Record<string, unknown>;

const payloadDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../backend/tests/payloads",
);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function listJsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(path);
    }
    return entry.name.endsWith(".json") ? [path] : [];
  });
}

function isSessionShaped(value: unknown): value is UnknownRecord {
  return isRecord(value) && typeof value["id"] === "string" && Array.isArray(value["agents"]);
}

function collectSessions(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSessions(item));
  }
  if (!isRecord(value)) {
    return [];
  }
  if (isSessionShaped(value)) {
    return [value];
  }
  const nested = value["sessions"];
  return isRecord(nested) ? Object.values(nested).flatMap((item) => collectSessions(item)) : [];
}

function loadSessions(): UnknownRecord[] {
  return listJsonFiles(payloadDirectory).flatMap((path) => {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return collectSessions(parsed);
  });
}

function cloneRecord(value: UnknownRecord): UnknownRecord {
  return structuredClone(value);
}

function firstAgentWithTurn(session: UnknownRecord): UnknownRecord {
  const agents = Array.isArray(session["agents"]) ? session["agents"] : [];
  for (const agent of agents) {
    if (isRecord(agent) && Array.isArray(agent["turns"]) && agent["turns"].length > 0) {
      return agent;
    }
  }
  throw new Error("No agent with turns");
}

const sessions = loadSessions();
const sessionWithTurn = sessions.find((session) => {
  try {
    firstAgentWithTurn(session);
    return true;
  } catch {
    return false;
  }
});

describe("backend payloads", () => {
  it("finds the committed session payloads", () => {
    expect(sessions.length).toBeGreaterThan(100);
    expect(sessionWithTurn).toBeDefined();
  });

  it("accepts every committed session", () => {
    const rejected = sessions.filter((session) => parseSession(session) === null);
    expect(rejected).toEqual([]);
  });

  it("accepts a hello built from the sessions", () => {
    expect(parseHello({ sessions })?.sessions).toHaveLength(sessions.length);
    expect(parseHello({ sessions: [] })).toEqual({ sessions: [] });
  });

  it("accepts a remove built from a session id", () => {
    const first = sessions[0];
    expect(first).toBeDefined();
    expect(parseRemove({ id: first?.["id"] })).toEqual({ id: first?.["id"] });
  });
});

describe("rejections", () => {
  it("rejects a session missing agents", () => {
    const session = cloneRecord(sessions[0] ?? {});
    delete session["agents"];
    expect(parseSession(session)).toBeNull();
  });

  it("rejects a turn with an unknown kind", () => {
    const session = cloneRecord(sessionWithTurn ?? {});
    const turns = firstAgentWithTurn(session)["turns"];
    const turn = Array.isArray(turns) ? turns[0] : undefined;
    expect(isRecord(turn)).toBe(true);
    if (isRecord(turn)) {
      turn["kind"] = "thought";
    }
    expect(parseSession(session)).toBeNull();
  });

  it("rejects an unknown final", () => {
    const session = cloneRecord(sessionWithTurn ?? {});
    firstAgentWithTurn(session)["final"] = "cancelled";
    expect(parseSession(session)).toBeNull();
  });

  it("rejects a hello holding an invalid session", () => {
    const session = cloneRecord(sessions[0] ?? {});
    delete session["run"];
    expect(parseHello({ sessions: [sessions[0], session] })).toBeNull();
  });

  it("rejects malformed remove and non-record values", () => {
    expect(parseRemove({ id: 4 })).toBeNull();
    expect(parseRemove(null)).toBeNull();
    expect(parseHello({})).toBeNull();
    expect(parseSession("session")).toBeNull();
  });
});
