import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SESSION_START,
  advance,
  agentOf,
  renderApp,
  sessionOf,
  setUpAppTestEnvironment,
} from "@/test/testSupport";

setUpAppTestEnvironment();

function open(...sessions: ReturnType<typeof sessionOf>[]) {
  const { sources } = renderApp();
  sources[0]?.emit("open");
  sources[0]?.emit("hello", { sessions });
  return sources[0];
}

function calm(id: string, name: string, overrides = {}) {
  return { ...sessionOf(id, name, overrides), agents: [agentOf(1, { name: "Orchestrator" })] };
}

function chip(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".run-status:not(.stale)");
}

describe("run status chip", () => {
  it("names who needs you and jumps to that agent", () => {
    open(sessionOf("cc:a", "Fix checkout"));
    expect(chip()?.textContent).toBe("Needs you · Security reviewerShow");
    fireEvent.click(screen.getByRole("button", { name: "Needs you · Security reviewer. Show" }));
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("3");
  });

  it("is quiet while a run is going and settles as Done with its duration", () => {
    const source = open(calm("cc:a", "Fix checkout"));
    expect(chip()?.textContent).toBe("Running");
    expect(chip()?.tagName).toBe("SPAN");
    source?.emit("session", calm("cc:a", "Fix checkout", { live: false, endAt: 20 }));
    expect(chip()?.textContent).toMatch(/^Done · took /);
    expect(chip()?.classList.contains("settle")).toBe(true);
  });

  it("announces when the open run starts needing you", () => {
    const source = open(calm("cc:a", "Fix checkout"));
    source?.emit("session", sessionOf("cc:a", "Fix checkout"));
    advance(60);
    expect(document.getElementById("sr")?.textContent).toBe("Fix checkout: Needs you · Security reviewer");
  });
});

function withFailedCall(id: string, name: string) {
  return {
    ...sessionOf(id, name),
    agents: [
      agentOf(1, { name: "Orchestrator", phases: [{ at: 1, state: "waiting" as const, note: "Waiting on agents." }] }),
      agentOf(2, {
        name: "Explorer",
        parent: 1,
        start: 1,
        end: 9,
        final: "complete" as const,
        returned: { summary: "FAILED: File does not exist.", items: [] },
        turns: [{ at: 6, kind: "tool" as const, name: "Read", target: "missing.txt", out: "File does not exist.", fail: true }],
      }),
    ],
  };
}

describe("failed calls", () => {
  it("names a failed call on the chip, jumps to its agent, and announces it once", () => {
    const source = open(calm("cc:a", "Fix checkout"));
    source?.emit("session", withFailedCall("cc:a", "Fix checkout"));
    advance(60);
    expect(chip()?.textContent).toBe("Waiting on agents · 1 call failedShow");
    expect(document.getElementById("sr")?.textContent).toBe("Fix checkout: Waiting on agents · 1 call failed");
    fireEvent.click(screen.getByRole("button", { name: "Waiting on agents · 1 call failed. Show" }));
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("2");
  });
});

describe("other runs", () => {
  it("shows a labelled pill with a count for other runs that need you", () => {
    open(sessionOf("cc:a", "First", { t0: SESSION_START }), sessionOf("cc:b", "Second", { t0: SESSION_START - 1000 }));
    const pill = document.querySelector(".alert-pill");
    expect(pill?.hasAttribute("hidden")).toBe(false);
    expect(pill?.textContent).toBe("1other needs you");
    expect(screen.getByRole("button", { name: /Switch session\. Second needs you|Switch session\. First needs you/ })).toBeTruthy();
  });

  it("stays hidden when nothing else needs attention", () => {
    open(calm("cc:a", "First"), calm("cc:b", "Second"));
    expect(document.querySelector(".alert-pill")?.hasAttribute("hidden")).toBe(true);
  });
});

describe("opening a run that needs you", () => {
  it("scrolls the blocked agent into view", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    open(sessionOf("cc:a", "Fix checkout"));
    const revealed = spy.mock.contexts.some((target) => target instanceof HTMLElement && target.dataset.fid === "3");
    expect(revealed).toBe(true);
  });

  it("leaves the scroll alone when nothing needs you", () => {
    const spy = vi.spyOn(Element.prototype, "scrollIntoView");
    open(calm("cc:a", "Fix checkout"));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("complete count", () => {
  it("does not bump when more agents finish", () => {
    const source = open(sessionOf("cc:a", "Fix checkout"));
    const base = sessionOf("cc:a", "Fix checkout");
    source?.emit("session", {
      ...base,
      agents: [
        ...base.agents,
        agentOf(5, { name: "Docs", parent: 1, start: 3, end: 9, final: "complete", returned: { summary: "ok", items: [] } }),
      ],
    });
    const complete = document.querySelector<HTMLElement>('.count[data-state="complete"] b');
    expect(complete?.textContent).toBe("2");
    expect(complete?.classList.contains("bump")).toBe(false);
  });
});
