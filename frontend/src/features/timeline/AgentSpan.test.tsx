import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { agentOf, preparedOf } from "@/model/agentFixtures";
import { AgentSpan } from "./AgentSpan";

function bar(agentOverrides: { start: number; end?: number }, axisEnd: number) {
  const [agent] = preparedOf([agentOf(1, agentOverrides)]);
  const { container } = render(<AgentSpan agent={agent!} state="complete" axisEnd={axisEnd} />);
  const rect = container.querySelector("rect.bar");
  return { x: Number(rect?.getAttribute("x")), width: Number(rect?.getAttribute("width")) };
}

describe("AgentSpan", () => {
  it("starts two agents spawned together at the same place and draws the longer one wider", () => {
    const short = bar({ start: 10, end: 57 }, 100);
    const long = bar({ start: 10, end: 90 }, 100);
    expect(long.x).toBe(short.x);
    expect(long.width).toBeGreaterThan(short.width);
  });

  it("runs a still-working agent to the end of the axis", () => {
    const running = bar({ start: 40 }, 100);
    expect(running.x + running.width).toBe(100);
  });

  it("keeps a near-instant agent visible", () => {
    expect(bar({ start: 10, end: 10 }, 1000).width).toBeGreaterThan(0);
  });
});
