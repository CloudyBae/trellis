import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { advance, agentOf, openRunMenu, renderApp, sessionOf, SESSION_START, setUpAppTestEnvironment } from "@/test/testSupport";

setUpAppTestEnvironment();

function selectedId(): string | undefined {
  return document.getElementById("pane")?.dataset.selectedId;
}

function runName(): string | undefined {
  return document.querySelector(".run-name")?.textContent ?? undefined;
}

describe("live stream", () => {
  it("opens one relative source and lists the runs from hello", () => {
    const { sources } = renderApp();
    expect(sources).toHaveLength(1);
    expect(sources[0]?.url).toBe("api/stream");
    sources[0]?.emit("open");
    sources[0]?.emit("hello", {
      sessions: [sessionOf("cc:a", "First run"), sessionOf("cc:b", "Second run", { t0: SESSION_START - 60_000 })],
    });
    expect(runName()).toBe("First run");
    openRunMenu();
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(2);
  });

  it("opens the first run that arrives by a session event and announces it", () => {
    const { sources } = renderApp();
    sources[0]?.emit("open");
    sources[0]?.emit("hello", { sessions: [] });
    sources[0]?.emit("session", sessionOf("cc:a", "Arrived"));
    expect(runName()).toBe("Arrived");
    advance(40);
    expect(screen.getByRole("status").textContent).toBe("Showing Arrived");
  });

  it("keeps the selection when the open run updates and resets it only when the agent is gone", () => {
    const { sources } = renderApp();
    sources[0]?.emit("open");
    sources[0]?.emit("hello", { sessions: [sessionOf("cc:a", "First run")] });
    expect(selectedId()).toBe("3");
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(selectedId()).toBe("4");

    sources[0]?.emit("session", sessionOf("cc:a", "First run", { endAt: 40 }));
    expect(selectedId()).toBe("4");

    const withoutFixer = sessionOf("cc:a", "First run");
    withoutFixer.agents = withoutFixer.agents.filter((agent) => agent.id !== 4);
    sources[0]?.emit("session", withoutFixer);
    expect(selectedId()).toBe("3");
  });

  it("leaves the open run alone when another run updates", () => {
    const { sources } = renderApp();
    sources[0]?.emit("open");
    sources[0]?.emit("hello", {
      sessions: [sessionOf("cc:a", "First run"), sessionOf("cc:b", "Second run", { t0: SESSION_START - 60_000 })],
    });
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    sources[0]?.emit("session", sessionOf("cc:b", "Second run renamed", { t0: SESSION_START - 60_000 }));
    expect(runName()).toBe("First run");
    expect(selectedId()).toBe("4");
  });

  it("falls back to the first remaining run in display order when the open run is removed", () => {
    const { sources } = renderApp();
    sources[0]?.emit("open");
    sources[0]?.emit("hello", {
      sessions: [
        sessionOf("cc:a", "Open run"),
        sessionOf("cc:old", "Older run", { t0: SESSION_START - 600_000 }),
        sessionOf("cc:new", "Newer run", { t0: SESSION_START - 30_000 }),
      ],
    });
    sources[0]?.emit("remove", { id: "cc:a" });
    expect(runName()).toBe("Newer run");
    sources[0]?.emit("remove", { id: "cc:new" });
    sources[0]?.emit("remove", { id: "cc:old" });
    expect(screen.getByRole("heading", { name: "Nothing growing yet" })).toBeTruthy();
  });

  it("selects the orchestrator of a single-agent run", () => {
    const { sources } = renderApp();
    sources[0]?.emit("open");
    sources[0]?.emit("hello", {
      sessions: [sessionOf("cc:a", "First run", { agents: [agentOf(1, { name: "Orchestrator" })] })],
    });
    expect(selectedId()).toBe("1");
  });
});

describe("connection loss", () => {
  it("falls back to the demo runs when the first connection fails", () => {
    const { sources } = renderApp();
    expect(screen.getByRole("heading", { name: "Nothing growing yet" })).toBeTruthy();
    sources[0]?.emit("error");
    expect(sources[0]?.closed).toBe(true);
    expect(runName()).toBe("Rotate session tokens");
    openRunMenu();
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(6);
    expect(screen.queryByRole("button", { name: "Close demo" })).toBeNull();
  });

  it("falls back when the source opened but never said hello", () => {
    const { sources } = renderApp();
    sources[0]?.emit("open");
    sources[0]?.emit("error");
    expect(runName()).toBe("Rotate session tokens");
  });

  it("only marks the link down after hello and recovers on the next hello", () => {
    const { sources } = renderApp();
    sources[0]?.emit("open");
    sources[0]?.emit("hello", { sessions: [sessionOf("cc:a", "First run")] });
    sources[0]?.emit("error");
    expect(sources[0]?.closed).toBe(false);
    expect(runName()).toBe("First run");
    expect(document.querySelector(".run-meta")?.textContent).toContain(" · Trellis server stopped, reconnecting");

    sources[0]?.emit("hello", { sessions: [sessionOf("cc:a", "First run")] });
    expect(document.querySelector(".run-meta")?.textContent).not.toContain("reconnecting");
  });
});
