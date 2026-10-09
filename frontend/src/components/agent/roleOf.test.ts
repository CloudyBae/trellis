import { describe, expect, it } from "vitest";
import { agentOf } from "@/model/agentFixtures";
import { prepareAgents } from "@/model/agents";
import { guessRole, roleOf } from "./roleOf";

function roleFor(name: string, overrides: Parameters<typeof agentOf>[1] = {}) {
  const agents = prepareAgents([agentOf(1), agentOf(2, { name, parent: 1, ...overrides })]).agents;
  const agent = agents[1];
  if (agent === undefined) {
    throw new Error("missing agent");
  }
  return roleOf(agent);
}

describe("roleOf", () => {
  it("gives the agent without a parent the orchestrator role whatever its name", () => {
    const [root] = prepareAgents([agentOf(1, { name: "Fixer" })]).agents;
    expect(root && roleOf(root)).toBe("orchestrator");
  });

  it("maps known names directly and reads the agent type for unknown names", () => {
    expect(roleFor("Security reviewer")).toBe("reviewer");
    expect(roleFor("Type checker")).toBe("typecheck");
    expect(roleFor("Agent 2", { agentType: "Impeccable finish reviewer" })).toBe("reviewer");
    expect(roleFor("Agent 2")).toBe("agent");
  });
});

describe("guessRole", () => {
  it.each([
    ["Code auditor", "reviewer"],
    ["test writer", "testwriter"],
    ["writer of tests", "testwriter"],
    ["Unit test helper", "testrunner"],
    ["qa", "testrunner"],
    ["Docs helper", "docs"],
    ["Technical writer", "docs"],
    ["architect", "planner"],
    ["Code search", "explorer"],
    ["debugger", "fixer"],
    ["type-check", "typecheck"],
    ["type check", "typecheck"],
    ["typecheck", "typecheck"],
    ["lint", "typecheck"],
    ["developer", "implementer"],
  ] as const)("reads %s as %s", (description, role) => {
    expect(guessRole(description)).toBe(role);
  });

  it("does not match qa inside a word or doc after a letter", () => {
    expect(guessRole("aqa")).toBe("agent");
    expect(guessRole("qa2")).toBe("agent");
    expect(guessRole("bidoc")).toBe("agent");
  });

  it("does not match type without check, or writing without tests", () => {
    expect(guessRole("type")).toBe("agent");
    expect(guessRole("typeset")).toBe("agent");
    expect(guessRole("wrote")).toBe("agent");
  });

  it("takes the first matching role in legacy order", () => {
    expect(guessRole("security tester")).toBe("reviewer");
    expect(guessRole("test runner docs")).toBe("testrunner");
  });
});
