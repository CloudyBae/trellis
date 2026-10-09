import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolLeaf } from "./ToolLeaf";

function drawn(state: "ok" | "failed" | "pending") {
  const { container } = render(
    <svg>
      <ToolLeaf state={state} />
    </svg>,
  );
  const path = container.querySelector("path");
  return { className: path?.getAttribute("class"), shape: path?.getAttribute("d") };
}

describe("ToolLeaf", () => {
  it("draws a failed call with its own silhouette, not only another colour", () => {
    expect(drawn("failed").shape).not.toBe(drawn("ok").shape);
  });

  it("shares one silhouette between a finished and a running call and tells them apart by class", () => {
    expect(drawn("pending").shape).toBe(drawn("ok").shape);
    expect([drawn("ok").className, drawn("failed").className, drawn("pending").className]).toEqual([
      "tool-leaf",
      "tool-leaf failed",
      "tool-leaf pending",
    ]);
  });
});
