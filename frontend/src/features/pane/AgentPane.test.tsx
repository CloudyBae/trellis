import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PaneProps } from "@/lib/viewProps";
import { createDemoSessions } from "@/demo";
import type { ModelSession } from "@/model";
import { payloadSession } from "@/test/payloadSessions";
import { AgentPane } from "./AgentPane";

afterEach(cleanup);

function paneProps(session: ModelSession, selectedId: number | null, overrides: Partial<PaneProps> = {}): PaneProps {
  return {
    session,
    selectedId,
    now: session.endAt,
    narrow: false,
    onSelect: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

function pane(): HTMLElement {
  const element = document.getElementById("pane");
  if (element === null) {
    throw new Error("Missing pane");
  }
  return element;
}

function headings(): string[] {
  return [...pane().querySelectorAll("h2")].map((heading) => heading.textContent ?? "");
}

function turns(): { by: string; text: string }[] {
  return [...pane().querySelectorAll(".convo > li")].map((item) => ({
    by: item.querySelector(".by")?.textContent ?? "",
    text: item.querySelector(".body")?.textContent ?? item.textContent ?? "",
  }));
}

describe("an empty pane", () => {
  it("renders nothing and stays closed when no agent is selected", () => {
    const session = payloadSession("claude/appended.json", 4);
    render(<AgentPane {...paneProps(session, null)} />);
    expect(pane().className).toBe("pane");
    expect(pane().children).toHaveLength(0);
    expect(pane().getAttribute("aria-label")).toBe("Agent details");
  });
});

describe("the orchestrator", () => {
  const session = payloadSession("claude/appended.json", 4);

  it("shows its sections in order with a request, delegated agents and every turn kind", () => {
    render(<AgentPane {...paneProps(session, 1, { now: 60 })} />);
    expect(pane().className).toBe("pane open");
    expect(pane().querySelector(".who h1")?.textContent).toBe("Orchestrator");
    expect(pane().querySelector(".who p")?.textContent).toBe("Claude Code · main session");
    expect(pane().querySelector(".status")?.classList.contains("running")).toBe(true);
    expect(headings()).toEqual(["Your request", "Delegated to", "Conversation"]);
    expect([...pane().querySelectorAll(".kids button")].map((button) => button.textContent)).toEqual([
      "Explorercomplete",
      "Security reviewerfailed",
    ]);
    const rows = turns();
    expect(rows[rows.length - 1]).toEqual({ by: "you", text: session.by[1]?.task });
    expect(rows.map((row) => row.by)).toEqual([
      "Orchestrator",
      "failed",
      "returned",
      "Orchestrator",
      "delegated",
      "delegated",
      "tool",
      "Orchestrator",
      "you",
    ]);
    expect(rows[5]?.text).toBe(`Explorer: ${session.by[2]?.task}`);
    expect(rows[2]?.text).toBe("Explorer: 14 call sites across 6 files.");
    expect(rows[1]?.text).toBe("Security reviewer: Agent crashed");
  });

  it("names the model only when the source recorded one", () => {
    const withModel = { ...session, by: { ...session.by, 1: { ...session.by[1]!, model: "claude-sonnet-5-5" } } };
    const { rerender } = render(<AgentPane {...paneProps(withModel, 1, { now: 60 })} />);
    expect(pane().querySelector(".who .model")?.textContent).toBe("claude-sonnet-5-5");
    rerender(<AgentPane {...paneProps(session, 1, { now: 60 })} />);
    expect(pane().querySelector(".who .model")).toBeNull();
  });

  it("lists token usage only when the source recorded it", () => {
    const usage = { input: 12_400, output: 950, cacheRead: 2_100_000, cacheWrite: 0 };
    const withUsage = { ...session, by: { ...session.by, 1: { ...session.by[1]!, usage } } };
    const { rerender } = render(<AgentPane {...paneProps(withUsage, 1, { now: 60 })} />);
    expect(headings()).toContain("Tokens");
    expect([...pane().querySelectorAll(".tokens div")].map((row) => row.textContent)).toEqual([
      "Input12k",
      "Output950",
      "Cache read2.10M",
      "Cache written0",
      "Cache hit rate99%",
    ]);
    rerender(<AgentPane {...paneProps(session, 1, { now: 60 })} />);
    expect(headings()).not.toContain("Tokens");
  });

  it("ends with where the conversation was read from", () => {
    render(<AgentPane {...paneProps(session, 1, { now: 60 })} />);
    expect(pane().querySelector(".src-foot")?.textContent).toBe(
      "Read from ~/appended/-work-acme-api/33333333-cccc.jsonl.",
    );
  });

  it("reads the elapsed time from the clock prop", () => {
    const { rerender } = render(<AgentPane {...paneProps(session, 1, { now: 60 })} />);
    expect(pane().querySelector("time")?.textContent).toBe("1m 00s");
    rerender(<AgentPane {...paneProps(session, 1, { now: 65 })} />);
    expect(pane().querySelector("time")?.textContent).toBe("1m 05s");
  });
});

describe("a returned subagent", () => {
  const session = payloadSession("claude/appended.json", 4);

  it("shows what it was handed and what it returned, with the full result behind a disclosure", () => {
    render(<AgentPane {...paneProps(session, 2, { now: 60 })} />);
    expect(headings()).toEqual(["Returned to Orchestrator", "Handed in by Orchestrator", "Conversation"]);
    expect(pane().querySelector(".who p")?.textContent).toBe("Claude Code · delegated by Orchestrator");
    expect(pane().querySelector(".status")?.classList.contains("complete")).toBe(true);
    expect(pane().querySelector(".status time")?.textContent).toMatch(/^took /);
    expect(pane().querySelector(".handoff:not(.returned) .from")?.textContent).toMatch(/^Orchestrator at \d\d:\d\d:\d\d$/);
    const returned = pane().querySelector(".handoff.returned");
    expect(returned?.querySelector("blockquote")).toBeNull();
    expect(pane().querySelector(".status p")?.textContent).toBe("14 call sites across 6 files.");
    expect([...(returned?.querySelectorAll("li") ?? [])].map((item) => item.textContent)).toEqual([
      "Issued in src/auth/issue.ts:41",
      "Read by 9 middleware sites",
    ]);
    const more = returned?.querySelector("details.more") as HTMLDetailsElement;
    expect(more.open).toBe(false);
    expect(more.querySelector(".full")?.textContent).toContain("- Read by 9 middleware sites");
    expect(pane().querySelector(".turn.task .by")?.textContent).toBe("Orchestrator");
  });

  it("shows a failed subagent as failed with its reason", () => {
    render(<AgentPane {...paneProps(session, 3, { now: 60 })} />);
    expect(pane().querySelector(".status .st")?.textContent).toMatch(/^Failed/);
    expect(pane().querySelector(".status p")?.textContent).toBe("Agent crashed");
    expect(pane().querySelector(".who")?.classList.contains("s-failed")).toBe(true);
  });

  it("explains that a returned note belongs to the result", () => {
    const noted = payloadSession("claude/live_blocked.json", 5);
    const agentWithNote = noted.agents.find((agent) => agent.returned?.note);
    render(<AgentPane {...paneProps(noted, agentWithNote?.id ?? 1)} />);
    expect(pane().querySelector(".handoff.returned .note")?.textContent).toBe(agentWithNote?.returned?.note);
  });
});

describe("waiting and blocked agents", () => {
  it("shows what a waiting agent waits on", () => {
    const session = payloadSession("claude/live_blocked.json", 0);
    render(<AgentPane {...paneProps(session, 1, { now: 28 })} />);
    expect(pane().querySelector(".status.waiting p")?.textContent).toBe("Waiting on Explorer and Security reviewer to return.");
    expect(pane().querySelector(".status time")?.getAttribute("data-elapsed")).toBe("0");
  });

  it("tells the user to answer the prompt for a blocked agent", () => {
    const session = payloadSession("claude/hooks_edge.json", 1);
    render(<AgentPane {...paneProps(session, 1, { now: 60 })} />);
    const paragraphs = [...pane().querySelectorAll(".status.blocked p")].map((item) => item.textContent);
    expect(paragraphs).toEqual([
      "Waiting for your approval to run Bash npm test.",
      "Trellis only watches. Answer the prompt in Claude Code and this agent will carry on.",
    ]);
  });
});

describe("tool turns", () => {
  it("shows a pending tool as waiting, with its output behind a disclosure", () => {
    const session = payloadSession("claude/hooks_edge.json", 1);
    render(<AgentPane {...paneProps(session, 1, { now: 60 })} />);
    const tool = pane().querySelector(".turn.tool") as HTMLElement;
    expect(tool.querySelector(".tms")?.textContent).toBe("waiting");
    expect(tool.querySelector(".tms")?.classList.contains("live")).toBe(true);
    const details = tool.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(tool.querySelector("pre")?.textContent).toBeTruthy();
  });

  it("marks a failed tool with its duration, or alone when no duration was recorded", () => {
    const timed = payloadSession("codex/shell_output.json", 0);
    render(<AgentPane {...paneProps(timed, 1)} />);
    expect([...pane().querySelectorAll(".tms.bad")].map((item) => item.textContent)).toEqual(["failed · 1.0s"]);
    cleanup();
    const untimed = payloadSession("copilot/tool_output_forms.json", 0);
    render(<AgentPane {...paneProps(untimed, 1)} />);
    expect([...pane().querySelectorAll(".tms.bad")].map((item) => item.textContent)).toEqual(["failed"]);
  });

  it("formats durations under and over a second", () => {
    const session = payloadSession("claude/appended.json", 4);
    render(<AgentPane {...paneProps(session, 1, { now: 60 })} />);
    expect(pane().querySelector(".turn.tool .tms")?.textContent).toBe("1.0s");
    cleanup();
    const shapes = payloadSession("codex/output_shapes.json", 0);
    render(<AgentPane {...paneProps(shapes, 1)} />);
    expect(pane().querySelector(".turn.tool .tms")?.textContent).toBe("100ms");
  });
});

describe("long text", () => {
  const longTask = `${"Review every rotation path and report what breaks. ".repeat(20)}End.`;

  function longSession() {
    return payloadSession("claude/appended.json", 4, (source) => ({
      ...source,
      agents: source.agents.map((agent) => (agent.id === 2 ? { ...agent, task: longTask } : agent)),
    }));
  }

  it("shows the start of a long handoff and opens the rest on request", () => {
    render(<AgentPane {...paneProps(longSession(), 2, { now: 60 })} />);
    const more = pane().querySelector(".handoff blockquote details.more") as HTMLDetailsElement;
    const clipped = more.querySelector(".clipped")?.textContent ?? "";
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipped.length).toBeLessThan(longTask.length);
    expect(more.querySelector(".full")?.textContent).toBe(longTask);
    more.open = true;
    expect(more.open).toBe(true);
  });

  it("opens the conversation with the first lines of a long handoff", () => {
    render(<AgentPane {...paneProps(longSession(), 2, { now: 60 })} />);
    const opening = pane().querySelector(".turn.task .body")?.textContent ?? "";
    expect(opening.endsWith("…")).toBe(true);
    expect(opening.length).toBeLessThanOrEqual(321);
  });

  it("keeps a short handoff whole", () => {
    const session = payloadSession("claude/appended.json", 4);
    render(<AgentPane {...paneProps(session, 2, { now: 60 })} />);
    expect(pane().querySelector(".handoff:not(.returned) details.more")).toBeNull();
  });
});

describe("trimmed conversations", () => {
  it("says how many earlier turns are not shown and explains evenly spaced times", () => {
    const session = payloadSession("copilot/trimmed_turns.json", 0);
    const root = session.by[1];
    render(<AgentPane {...paneProps(session, 1)} />);
    expect(pane().querySelector(".turns-trimmed")?.textContent).toBe(`${root?.trimmed} earlier turns are not shown.`);
    expect(pane().querySelector(".turns-trimmed")?.nextElementSibling?.classList.contains("turn")).toBe(true);
    expect(turns().filter((row) => row.by === "you").length).toBeGreaterThan(1);
    expect(pane().querySelector(".src-foot")?.textContent).toContain(
      "This tool records one time per request, so steps within a request are spaced evenly.",
    );
  });
});

describe("the completeness label", () => {
  it.each([
    [1, "complete", "Conversation available"],
    [2, "partial", "Partial conversation"],
    [3, "activity_only", "Activity only, message content unavailable"],
  ] as const)("labels agent %i as %s", (id, completeness, label) => {
    const session = payloadSession("codex/subagent_completeness.json", 0);
    render(<AgentPane {...paneProps(session, id)} />);
    const element = pane().querySelector(".completeness");
    expect(element?.textContent).toBe(label);
    expect(element?.getAttribute("data-completeness")).toBe(completeness);
  });
});

describe("pane interaction", () => {
  const session = payloadSession("claude/appended.json", 4);

  it("goes to a delegated agent and back to the top, and closes with the back button", () => {
    const props = paneProps(session, 1, { now: 60 });
    render(<AgentPane {...props} />);
    pane().scrollTop = 300;
    fireEvent.click(pane().querySelector('.kids [data-go="3"]') as HTMLElement);
    expect(props.onSelect).toHaveBeenCalledWith(3, { reveal: true });
    expect(pane().scrollTop).toBe(0);
    fireEvent.click(pane().querySelector(".back") as HTMLElement);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("links a subagent back to the agent that delegated to it", () => {
    const props = paneProps(session, 2, { now: 60 });
    render(<AgentPane {...props} />);
    fireEvent.click(pane().querySelector(".who [data-go]") as HTMLElement);
    expect(props.onSelect).toHaveBeenCalledWith(1, { reveal: true });
  });

  it("keeps an open disclosure and the scroll position while the same agent updates", () => {
    const { rerender } = render(<AgentPane {...paneProps(session, 1, { now: 60 })} />);
    const details = pane().querySelector(".turn.tool details") as HTMLDetailsElement;
    details.open = true;
    pane().scrollTop = 120;
    rerender(<AgentPane {...paneProps(session, 1, { now: 61 })} />);
    expect((pane().querySelector(".turn.tool details") as HTMLDetailsElement).open).toBe(true);
    expect(pane().scrollTop).toBe(120);
  });

  it("starts at the top with closed disclosures when another agent is selected", () => {
    const { rerender } = render(<AgentPane {...paneProps(session, 1, { now: 60 })} />);
    (pane().querySelector(".turn.tool details") as HTMLDetailsElement).open = true;
    pane().scrollTop = 120;
    rerender(<AgentPane {...paneProps(session, 2, { now: 60 })} />);
    rerender(<AgentPane {...paneProps(session, 1, { now: 60 })} />);
    expect((pane().querySelector(".turn.tool details") as HTMLDetailsElement).open).toBe(false);
    expect(pane().scrollTop).toBe(0);
  });

  it("closes when the selection is cleared", () => {
    const { rerender } = render(<AgentPane {...paneProps(session, 1, { now: 60 })} />);
    rerender(<AgentPane {...paneProps(session, null, { now: 60 })} />);
    expect(pane().className).toBe("pane");
    expect(pane().children).toHaveLength(0);
  });
});

describe("demo sessions", () => {
  it("say where the data was read from and that it is synthetic", () => {
    const demo = createDemoSessions()[0] as ModelSession;
    const subagent = demo.agents.find((agent) => agent.parent);
    render(<AgentPane {...paneProps(demo, subagent?.id ?? 2)} />);
    const footer = pane().querySelector(".src-foot")?.textContent ?? "";
    expect(footer).toContain(demo.run.file);
    expect(footer).toContain(`, ${subagent?.name}`);
    expect(footer.endsWith("Synthetic demo data.")).toBe(true);
    cleanup();
    render(<AgentPane {...paneProps(demo, 1)} />);
    expect(pane().querySelector(".src-foot")?.textContent).not.toContain("subagent");
  });
});

describe("the answer-first pane", () => {
  it("counts failed calls on a finished agent and says it still finished", () => {
    const session = payloadSession("claude/finished.json", 0, (source) => ({
      ...source,
      agents: source.agents.map((agent) =>
        agent.id === 2
          ? { ...agent, turns: [...agent.turns, { at: 1, kind: "tool" as const, name: "Bash", target: "npm test", out: "", fail: true }] }
          : agent,
      ),
    }));
    render(<AgentPane {...paneProps(session, 2, { now: 60 })} />);
    expect(pane().querySelector(".status .aside")?.textContent).toBe("1 tool call failed along the way; the agent still finished.");
  });

  it("previews a long prompt behind a disclosure so the result stays near the top", () => {
    const session = payloadSession("claude/finished.json", 0, (source) => ({
      ...source,
      agents: source.agents.map((agent) => (agent.id === 2 ? { ...agent, task: "Review the design. ".repeat(60) } : agent)),
    }));
    render(<AgentPane {...paneProps(session, 2, { now: 60 })} />);
    const handoff = pane().querySelector(".handoff:not(.returned)");
    expect(handoff?.querySelector("details.more")).not.toBeNull();
    expect((handoff?.querySelector(".clipped")?.textContent ?? "").length).toBeLessThan(260);
  });

  it("lists a generic delegate by its task", () => {
    const session = payloadSession("claude/finished.json", 0, (source) => ({
      ...source,
      agents: source.agents.map((agent) => (agent.id === 2 ? { ...agent, name: "General agent", agentType: "general-purpose", brief: "Icon review" } : agent)),
    }));
    render(<AgentPane {...paneProps(session, 1, { now: 60 })} />);
    expect(pane().querySelector('.kids [data-go="2"]')?.textContent).toContain("Icon review");
  });
});
