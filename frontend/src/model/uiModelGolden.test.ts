import { describe, expect, it } from "vitest";
import { describeSession } from "./goldenSnapshot";
import { isRecord, loadPayloadFiles, readGoldenLines, readSessionNowGolden } from "./payloadFixtures";
import { sessionNow } from "./sessions";
import type { DemoSession } from "./types";

function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function layoutEntries(snapshot: unknown): Record<string, unknown>[] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot["snapshots"])) {
    return [];
  }
  return snapshot["snapshots"].flatMap((entry: unknown) =>
    isRecord(entry) && Array.isArray(entry["layouts"])
      ? entry["layouts"].filter((layoutEntry): layoutEntry is Record<string, unknown> =>
          isRecord(layoutEntry),
        )
      : [],
  );
}

function maskHangingLayouts(actual: unknown, expected: unknown): number {
  const expectedEntries = layoutEntries(expected);
  const actualEntries = layoutEntries(actual);
  let masked = 0;
  expectedEntries.forEach((entry, index) => {
    const counterpart = actualEntries[index];
    if (entry["layout"] !== null || counterpart === undefined) {
      return;
    }
    const laidOut = counterpart["layout"];
    const lane = isRecord(laidOut) && isRecord(laidOut["lane"]) ? laidOut["lane"] : {};
    expect(Object.values(lane)).toContain(null);
    counterpart["layout"] = null;
    masked += 1;
  });
  return masked;
}

describe("ui model equals the page functions on committed payloads", () => {
  const files = loadPayloadFiles();

  it("covers the committed payloads", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files.map((file) => [file.name, file] as const))("%s", (_, file) => {
    const expected = readGoldenLines(file.name);
    expect(expected).toHaveLength(file.sessions.length);
    file.sessions.forEach((session, index) => {
      const actual = roundTrip(describeSession(session));
      maskHangingLayouts(actual, expected[index]);
      expect(actual).toEqual(expected[index]);
    });
  });
});

describe("sessionNow equals the page on demo-shaped sessions", () => {
  it.each(readSessionNowGolden().map((entry, index) => [index, entry] as const))(
    "case %i",
    (_, entry) => {
      if (!isRecord(entry) || !isRecord(entry["session"])) {
        throw new Error("malformed golden");
      }
      const shape = entry["session"];
      const session: DemoSession = {
        real: false,
        id: "demo",
        live: shape["live"] === true,
        replay: shape["replay"] === true,
        t0: typeof shape["t0"] === "number" ? shape["t0"] : 0,
        endAt: typeof shape["endAt"] === "number" ? shape["endAt"] : 0,
        nowAt: typeof shape["nowAt"] === "number" ? shape["nowAt"] : 0,
        run: { name: "", repo: "", source: "", file: "", clock0: 0 },
        agents: [],
        by: {},
      };
      const tick = typeof entry["tick"] === "number" ? entry["tick"] : -1;
      expect(sessionNow(session, 0, tick)).toBe(entry["value"]);
    },
  );
});
