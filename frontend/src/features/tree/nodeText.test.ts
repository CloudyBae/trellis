import { describe, expect, it } from "vitest";
import { agentOf, preparedOf } from "@/model/agentFixtures";
import { taskLabel } from "@/components/agent/taskLabel";
import { nodeActivity } from "./nodeText";

function settledText(summary: string): string {
  const [, agent] = preparedOf([agentOf(1), agentOf(2, { parent: 1, returned: { summary, items: [] } })]);
  return nodeActivity(agent!, { s: "complete" }, 9, false, false);
}

describe("nodeActivity", () => {
  it("shows what a running subagent was asked, with paths cut to their file name", () => {
    const [, agent] = preparedOf([
      agentOf(1),
      agentOf(2, { parent: 1, name: "Explorer", brief: "Audit /Users/me/app/src/TreeNode.tsx" }),
    ]);
    expect(nodeActivity(agent!, { s: "running" }, 3, false, false)).toBe("Audit TreeNode.tsx");
  });

  it("shows the first sentence of the result, skipping a label line", () => {
    expect(settledText("FINDINGS:\nThe fold hides 3 agents. Nothing else changed.")).toBe("The fold hides 3 agents.");
  });

  it("turns a result that is only a path into the file name", () => {
    expect(settledText("/Users/me/app/frontend/src/features/tree/placement.ts")).toBe("placement.ts");
  });

  it("shows live activity on a running generic agent, because its task is the node label", () => {
    const [, agent] = preparedOf([
      agentOf(1),
      agentOf(2, {
        parent: 1,
        brief: "Icon review",
        turns: [{ at: 1, kind: "tool", name: "Read", target: "SvgSprite.tsx", out: "" }],
      }),
    ]);
    expect(nodeActivity(agent!, { s: "running" }, 3, false, false)).toBe("Read SvgSprite.tsx");
  });
});

describe("taskLabel", () => {
  it("labels a generic agent by its task and leaves named roles and briefless agents alone", () => {
    const [, generic, explorer, briefless] = preparedOf([
      agentOf(1),
      agentOf(2, { parent: 1, brief: "Icon review" }),
      agentOf(3, { parent: 1, name: "Explorer", brief: "Map session reads" }),
      agentOf(4, { parent: 1 }),
    ]);
    expect([generic, explorer, briefless].map((agent) => taskLabel(agent!))).toEqual(["Icon review", null, null]);
  });
});
