import { describe, expect, it } from "vitest";
import { activity, isSettled, signature, stateOf } from "./agents";
import { plainName, siblingNumber } from "./text";
import { agentOf, preparedOf } from "./agentFixtures";
import { assertNever } from "./exhaustive";
import type { AgentState } from "./types";

describe("stateOf", () => {
  it("reports the final state once an agent has ended", () => {
    const [agent] = preparedOf([agentOf(1, { end: 5, final: "failed" })]);
    expect(agent && stateOf(agent, 5)).toEqual({ s: "failed" });
  });

  it("uses the latest phase that has begun", () => {
    const [agent] = preparedOf([
      agentOf(1, {
        phases: [
          { at: 2, state: "blocked", note: "Needs approval" },
          { at: 6, state: "running", note: "" },
        ],
      }),
    ]);
    expect(agent && stateOf(agent, 3)).toEqual({ s: "blocked", note: "Needs approval" });
    expect(agent && stateOf(agent, 7)).toEqual({ s: "running", note: "" });
  });

  it("waits on working children and names duplicates in full", () => {
    const [root] = preparedOf([
      agentOf(1),
      agentOf(2, { parent: 1, name: "Explorer", start: 1 }),
      agentOf(3, { parent: 1, name: "Explorer", start: 2 }),
      agentOf(4, { parent: 1, name: "Fixer", start: 3 }),
    ]);
    expect(root && stateOf(root, 4)).toEqual({
      s: "waiting",
      note: "Waiting on Explorer 1, Explorer 2 and Fixer to return.",
    });
  });

  it("runs when nothing else applies", () => {
    const [agent] = preparedOf([agentOf(1)]);
    expect(agent && stateOf(agent, 0)).toEqual({ s: "running" });
  });
});

describe("activity", () => {
  it("describes the latest turn by kind", () => {
    const [agent] = preparedOf([
      agentOf(1, {
        brief: "brief text",
        turns: [
          { at: 1, kind: "user", text: "hello" },
          { at: 2, kind: "tool", name: "Read", target: "a.ts", out: "" },
          { at: 3, kind: "msg", text: "done" },
        ],
      }),
    ]);
    expect(agent && activity(agent, 0)).toBe("brief text");
    expect(agent && activity(agent, 1)).toBe("You: hello");
    expect(agent && activity(agent, 2)).toBe("Read a.ts");
    expect(agent && activity(agent, 3)).toBe("done");
  });
});

describe("exhaustive handling of state unions", () => {
  it("classifies every agent state", () => {
    const states: AgentState[] = [
      { s: "running" },
      { s: "waiting" },
      { s: "blocked" },
      { s: "failed" },
      { s: "complete" },
    ];
    expect(states.map(isSettled)).toEqual([false, false, false, true, true]);
  });

  it("fails loudly at runtime if an unexpected variant reaches the guard", () => {
    const unexpected: unknown = { s: "paused" };
    expect(() => assertNever(unexpected as never)).toThrow("Unhandled variant");
  });
});

describe("signature", () => {
  it("appends the revision only when it is set", () => {
    const agents = preparedOf([agentOf(1, { turns: [{ at: 1, kind: "msg", text: "hi" }] })]);
    expect(signature(agents, 1, 0)).toBe("1running:1");
    expect(signature(agents, 1, undefined)).toBe("1running:1");
    expect(signature(agents, 1, 4)).toBe("1running:14");
    expect(signature(agents, -1, 4)).toBe("4");
  });
});

describe("siblingNumber", () => {
  it("numbers same-name siblings per parent and leaves lone agents and the root unnumbered", () => {
    const prepared = preparedOf([
      agentOf(1, { name: "Lead" }),
      agentOf(2, { parent: 1, name: "Reviewer", start: 1 }),
      agentOf(3, { parent: 1, name: "Researcher", start: 2 }),
      agentOf(4, { parent: 1, name: "Researcher", start: 3 }),
      agentOf(5, { parent: 1, name: "Researcher", start: 4 }),
      agentOf(6, { parent: 2, name: "Researcher", start: 5 }),
    ]);
    expect(prepared.map(siblingNumber)).toEqual([null, null, 1, 2, 3, null]);
    expect(prepared.map(plainName)).toEqual(["Lead", "Reviewer", "Researcher 1", "Researcher 2", "Researcher 3", "Researcher"]);
  });
});
