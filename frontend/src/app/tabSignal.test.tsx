import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TAB_FAVICON } from "@/lib/tabSignal";
import { SESSION_START, agentOf, renderApp, sessionOf, setUpAppTestEnvironment } from "@/test/testSupport";

setUpAppTestEnvironment();

afterEach(() => {
  vi.restoreAllMocks();
});

function calm(id: string, overrides = {}) {
  return { ...sessionOf(id, id, overrides), agents: [agentOf(1, { name: "Orchestrator" })] };
}

function icon(): string {
  return document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.getAttribute("href") ?? "";
}

function setAway(away: boolean): void {
  vi.spyOn(document, "hasFocus").mockReturnValue(!away);
  act(() => {
    window.dispatchEvent(new Event(away ? "blur" : "focus"));
  });
}

function open(sessions: ReturnType<typeof sessionOf>[]) {
  const { sources } = renderApp();
  sources[0]?.emit("open");
  sources[0]?.emit("hello", { sessions });
  return sources[0];
}

describe("tab signal", () => {
  it("shows a blocked agent in the tab title and favicon, and clears it when it resolves", () => {
    const source = open([sessionOf("cc:a", "Blocked run")]);
    expect(document.title).toBe("● Needs you · Trellis");
    expect(icon()).toBe(TAB_FAVICON.blocked);
    source?.emit("session", calm("cc:a"));
    expect(document.title).toBe("Trellis");
    expect(icon()).toBe(TAB_FAVICON.idle);
  });

  it("keeps the plain tab for synthetic demo runs", () => {
    renderApp("?demo");
    expect(document.title).toBe("Trellis");
  });

  it("says Done when a run finishes while you are away, and clears it when you return", () => {
    setAway(true);
    const source = open([calm("cc:a")]);
    expect(document.title).toBe("Trellis");
    source?.emit("session", calm("cc:a", { live: false, endAt: 20 }));
    expect(document.title).toBe("✓ Done · Trellis");
    expect(icon()).toBe(TAB_FAVICON.done);
    setAway(false);
    expect(document.title).toBe("Trellis");
  });

  it("does not announce a finish you were there to see", () => {
    setAway(false);
    const source = open([calm("cc:a")]);
    source?.emit("session", calm("cc:a", { live: false, endAt: 20 }));
    expect(document.title).toBe("Trellis");
  });

  it("shows a failed agent as a heads-up that Done outranks, and a failed run above both", () => {
    setAway(true);
    const source = open([calm("cc:a"), calm("cc:b", { t0: SESSION_START - 1000 })]);
    source?.emit("session", {
      ...calm("cc:b", { t0: SESSION_START - 1000 }),
      agents: [
        agentOf(1, { name: "Orchestrator" }),
        agentOf(2, { parent: 1, start: 1, end: 5, final: "failed", returned: { summary: "x", items: [] } }),
      ],
    });
    expect(document.title).toBe("✕ Agent failed · Trellis");
    source?.emit("session", calm("cc:a", { live: false, endAt: 20 }));
    expect(document.title).toBe("✓ Done · Trellis");
    source?.emit("session", {
      ...calm("cc:b", { t0: SESSION_START - 1000, live: false, endAt: 20 }),
      agents: [agentOf(1, { name: "Orchestrator", end: 20, final: "failed", returned: { summary: "x", items: [] } })],
    });
    expect(document.title).toBe("✕ Run failed · Trellis");
    source?.emit("session", sessionOf("cc:c", "Blocked run", { t0: SESSION_START + 1000 }));
    expect(document.title).toBe("● Needs you · Trellis");
  });
});
