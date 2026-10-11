import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/api";
import { payloadSession } from "@/test/payloadSessions";
import { TreeView } from "../tree/TreeView";
import { AgentPane } from "./AgentPane";

afterEach(cleanup);

const IMAGE = "<img src=x onerror=alert(1)>";
const SCRIPT = "<script>alert(1)</script>";

function hostileSession() {
  return payloadSession("claude/appended.json", 4, (source): Session => ({
    ...source,
    run: { ...source.run, file: IMAGE },
    agents: source.agents.map((agent) => {
      if (agent.id === 1) {
        return {
          ...agent,
          brief: SCRIPT,
          file: SCRIPT,
          turns: [
            { at: 1, kind: "user", text: SCRIPT },
            { at: 2, kind: "tool", name: IMAGE, target: SCRIPT, out: IMAGE, ms: 5 },
            { at: 3, kind: "msg", text: IMAGE },
          ],
        };
      }
      if (agent.id === 2) {
        return {
          ...agent,
          name: IMAGE,
          task: SCRIPT,
          context: [IMAGE, SCRIPT],
          returned: { summary: SCRIPT, items: [IMAGE, SCRIPT], text: IMAGE, note: SCRIPT },
        };
      }
      return agent;
    }),
  }));
}

function expectInert(container: HTMLElement): void {
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("script")).toBeNull();
  expect(container.querySelector("[onerror]")).toBeNull();
}

function texts(container: HTMLElement, selector: string): string[] {
  return [...container.querySelectorAll(selector)].map((element) => element.textContent ?? "");
}

describe("hostile transcript text", () => {
  it("renders in the tree as plain text in names, activity lines and labels", () => {
    const session = hostileSession();
    const { container } = render(
      <main className="garden">
        <TreeView session={session} selectedId={2} now={60} narrow={false} onSelect={vi.fn()} />
      </main>,
    );
    expectInert(container);
    const node = container.querySelector('[data-fid="2"]') as HTMLElement;
    expect(node.querySelector(".nname")?.textContent).toBe(IMAGE);
    expect(node.getAttribute("aria-label")).toBe(`${IMAGE}, delegated by Orchestrator, complete. ${SCRIPT}`);
    expect(node.querySelector(".nact")?.textContent).toBe(SCRIPT);
    expect(container.querySelector('[data-fid="1"] .nact')?.textContent).toBe(IMAGE);
    expect(container.querySelector(".crumb.now")?.textContent).toBe(IMAGE);
  });

  it("renders in the pane as plain text in every transcript field", () => {
    const session = hostileSession();
    const subagent = render(<AgentPane session={session} selectedId={2} now={60} narrow={false} onSelect={vi.fn()} onClose={vi.fn()} />);
    expectInert(subagent.container);
    const pane = subagent.container;
    expect(pane.querySelector("h1")?.textContent).toBe(IMAGE);
    expect(pane.querySelector(".handoff blockquote")?.textContent).toBe(SCRIPT);
    expect(texts(pane, ".chip")).toEqual([IMAGE, SCRIPT]);
    expect(pane.querySelector(".status p")?.textContent).toBe(SCRIPT);
    expect(texts(pane, ".returned li")).toEqual([IMAGE, SCRIPT]);
    expect(pane.querySelector(".returned .full")?.textContent).toBe(IMAGE);
    expect(pane.querySelector(".returned .note")?.textContent).toBe(SCRIPT);
    expect(pane.querySelector(".turn.task .body")?.textContent).toBe(SCRIPT);
    cleanup();

    const root = render(<AgentPane session={session} selectedId={1} now={60} narrow={false} onSelect={vi.fn()} onClose={vi.fn()} />);
    expectInert(root.container);
    const rootPane = root.container;
    expect(texts(rootPane, ".turn.msg-user .body")).toContain(SCRIPT);
    expect(rootPane.querySelector(".turn.tool .tname")?.textContent).toBe(IMAGE);
    expect(rootPane.querySelector(".turn.tool .ttarget")?.textContent).toBe(SCRIPT);
    expect(rootPane.querySelector(".turn.tool pre")?.textContent).toBe(IMAGE);
    expect(rootPane.querySelector(".turn.msg-agent .body")?.textContent).toBe(IMAGE);
    expect(rootPane.querySelector(".status p")?.textContent).toBe(IMAGE);
    expect(rootPane.querySelector(".src-foot .mono")?.textContent).toBe(SCRIPT);
    expect(rootPane.querySelector(".kids")?.textContent).toContain(IMAGE);
  });

  it("renders the run file as plain text for a subagent without its own file", () => {
    const session = hostileSession();
    const { container } = render(
      <AgentPane session={session} selectedId={3} now={60} narrow={false} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expectInert(container);
  });
});
