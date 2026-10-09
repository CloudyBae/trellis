import { describe, expect, it } from "vitest";
import { agentOf, preparedOf } from "./agentFixtures";
import { layout } from "./layout";
import { loadPayloadFiles } from "./payloadFixtures";
import type { Layout, PreparedAgent } from "./types";

function placements(laidOut: Layout): Map<string, { y: number; h: number; lane: number | undefined }> {
  return new Map(
    laidOut.rows.flatMap((row) =>
      row.type === "now"
        ? []
        : [[`${row.type}${row.a.id}`, { y: row.y, h: row.h, lane: laidOut.lane[row.a.id] }] as const],
    ),
  );
}

function expectExistingRowsUnchanged(before: PreparedAgent[], after: PreparedAgent[], time: number): void {
  for (const narrow of [false, true]) {
    const earlier = placements(layout(before, time, narrow, null));
    const later = placements(layout(after, time, narrow, null));
    earlier.forEach((placement, key) => {
      expect(later.get(key)).toEqual(placement);
    });
  }
}

describe("layout stability when an agent starts later", () => {
  it("keeps every existing row and lane in a hand-built tree", () => {
    const existing = [
      agentOf(1, { end: 40, final: "complete" }),
      agentOf(2, { parent: 1, start: 5, end: 20, final: "complete" }),
      agentOf(3, { parent: 1, start: 8 }),
      agentOf(4, { parent: 3, start: 12 }),
    ];
    const added = agentOf(5, { parent: 1, start: 30 });
    const time = 30;
    const before = layout(preparedOf(existing), time, false, null);
    const after = layout(preparedOf([...existing, added]), time, false, null);
    expect(after.rows.length).toBe(before.rows.length + 1);
    expectExistingRowsUnchanged(preparedOf(existing), preparedOf([...existing, added]), time);
    expect(after.lane[5]).toBeDefined();
  });

  it("holds on every committed session whose last starter begins after all other events", () => {
    let checked = 0;
    loadPayloadFiles().forEach((file) => {
      file.sessions.forEach((session) => {
        const latest = Math.max(...session.agents.map((agent) => agent.start));
        const starters = session.agents.filter((agent) => agent.start === latest);
        const others = session.agents.filter((agent) => agent.start !== latest);
        const newcomer = starters[0];
        const parentKnown =
          newcomer !== undefined &&
          (!newcomer.parent || others.some((agent) => agent.id === newcomer.parent));
        const othersDone = others.every((agent) => agent.end == null || agent.end < latest);
        if (starters.length !== 1 || others.length === 0 || !parentKnown || !othersDone) {
          return;
        }
        expectExistingRowsUnchanged(preparedOf(others), preparedOf(session.agents), latest);
        checked += 1;
      });
    });
    expect(checked).toBeGreaterThan(10);
  });
});
