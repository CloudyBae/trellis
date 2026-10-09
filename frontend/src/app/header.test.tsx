import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  SESSION_START,
  advance,
  openRunMenu,
  renderApp,
  sessionOf,
  stubMatchMedia,
  setUpAppTestEnvironment,
} from "@/test/testSupport";

setUpAppTestEnvironment();

function startClock(): string {
  const start = new Date(SESSION_START);
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(start.getHours())}:${two(start.getMinutes())}:${two(start.getSeconds())}`;
}

function openWith(...names: string[]) {
  const { sources } = renderApp();
  sources[0]?.emit("open");
  sources[0]?.emit("hello", {
    sessions: names.map((name, index) => sessionOf(`cc:${index}`, name, { t0: SESSION_START - index * 60_000 })),
  });
  return sources[0];
}

describe("header", () => {
  it("shows the run name, meta and state counts for a session", () => {
    openWith("Fix checkout");
    expect(screen.getByText("Fix checkout", { selector: ".run-name" })).toBeTruthy();
    const meta = document.querySelector(".run-meta")?.textContent;
    expect(meta).toBe(`acme/web · Claude Code · started ${startClock()} · 30s`);
    const counts = Object.fromEntries(
      [...document.querySelectorAll<HTMLButtonElement>(".count")].map((button) => [
        button.dataset.state,
        [button.querySelector("b")?.textContent, button.disabled],
      ]),
    );
    expect(counts).toEqual({
      running: ["1", false],
      waiting: ["1", false],
      blocked: ["1", false],
      failed: ["0", true],
      complete: ["1", false],
    });
    expect(screen.getByRole("button", { name: "1 blocked, show next" })).toBeTruthy();
  });

  it("ticks the run time every second", () => {
    openWith("Fix checkout");
    advance(3000);
    expect(document.querySelector(".run-meta .tnum")?.textContent).toBe("33s");
  });

  it("selects the blocked agent first and cycles through a state on a count click", () => {
    openWith("Fix checkout");
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("3");
    fireEvent.click(screen.getByRole("button", { name: "1 running, show next" }));
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("4");
  });
});

describe("run menu", () => {
  it("opens on the down arrow, moves with the arrows, and closes on Escape with focus back", () => {
    openWith("First run", "Second run");
    const trigger = screen.getByRole("button", { name: /Switch session/ });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const rows = screen.getAllByRole("menuitemradio");
    expect(rows.map((row) => row.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    expect(document.activeElement).toBe(rows[0]);

    fireEvent.keyDown(rows[0] as HTMLElement, { key: "ArrowDown" });
    advance(1);
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1] as HTMLElement, { key: "ArrowDown" });
    advance(1);
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1] as HTMLElement, { key: "Home" });
    advance(1);
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0] as HTMLElement, { key: "End" });
    advance(1);
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1] as HTMLElement, { key: "ArrowUp" });
    advance(1);
    expect(document.activeElement).toBe(rows[0]);

    fireEvent.keyDown(rows[0] as HTMLElement, { key: "Escape" });
    advance(1);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("switches run on choice, announces it and returns focus to the trigger", () => {
    openWith("First run", "Second run");
    const trigger = openRunMenu();
    fireEvent.click(screen.getAllByRole("menuitemradio")[1] as HTMLElement);
    advance(1);
    expect(document.querySelector(".run-name")?.textContent).toBe("Second run");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    advance(40);
    expect(screen.getByRole("status").textContent).toBe("Showing Second run");
  });

  it("closes when a pointer press lands outside the menu", () => {
    openWith("First run", "Second run");
    const trigger = openRunMenu();
    advance(1);
    fireEvent.pointerDown(document.body);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("steps through runs with the bracket keys", () => {
    openWith("First run", "Second run");
    fireEvent.keyDown(document.body, { key: "]" });
    expect(document.querySelector(".run-name")?.textContent).toBe("Second run");
    fireEvent.keyDown(document.body, { key: "[" });
    expect(document.querySelector(".run-name")?.textContent).toBe("First run");
  });

  it("puts a dot on the switcher when another live run needs you", () => {
    const { sources } = renderApp();
    const blocked = sessionOf("cc:b", "Blocked run", { t0: SESSION_START - 120_000 });
    sources[0]?.emit("open");
    sources[0]?.emit("hello", { sessions: [sessionOf("cc:a", "First run"), blocked] });
    const trigger = screen.getByRole("button", { name: /Switch session/ });
    expect(trigger.getAttribute("aria-label")).toBe("First run. Switch session. Blocked run needs you");
    expect(trigger.title).toBe("Blocked run needs you");
  });
});

describe("theme toggle", () => {
  it("stores an explicit choice and sets data-theme", () => {
    stubMatchMedia({ dark: false });
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("trellis:theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
  });

  it("returns control to the system when the choice matches it", () => {
    stubMatchMedia({ dark: false });
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem("trellis:theme")).toBeNull();
  });

  it("follows a system change while no choice is stored", () => {
    const media = stubMatchMedia({ dark: false });
    renderApp();
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
    media.setDark(true);
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
  });

  it("starts from the theme the pre-paint script set", () => {
    document.documentElement.dataset.theme = "dark";
    stubMatchMedia({ dark: false });
    renderApp();
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
  });
});

describe("run menu reordering", () => {
  it("stays open with focus on the same run when rows are reordered", () => {
    const { sources } = renderApp();
    const calm = (id: string, name: string) => {
      const session = sessionOf(id, name, { t0: SESSION_START - 60_000 });
      session.agents = session.agents.filter((agent) => agent.id !== 3);
      return session;
    };
    sources[0]?.emit("open");
    sources[0]?.emit("hello", { sessions: [sessionOf("cc:a", "First run"), calm("cc:b", "Second run")] });
    const trigger = openRunMenu();
    const second = screen.getAllByRole("menuitemradio")[1] as HTMLElement;
    second.focus();
    sources[0]?.emit("session", sessionOf("cc:b", "Second run", { t0: SESSION_START + 1000 }));
    advance(10);
    const rows = screen.getAllByRole("menuitemradio");
    expect(rows[0]?.getAttribute("data-sid")).toBe("cc:b");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(rows[0]);
  });
});
