import { act, fireEvent, screen } from "@testing-library/react";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import {
  SESSION_START,
  advance,
  openRunMenu,
  renderApp,
  sessionOf,
  stubMatchMedia,
  setUpAppTestEnvironment,
} from "@/test/testSupport";
import type { FakeSource } from "@/test/testSupport";

setUpAppTestEnvironment();

function openWith(...names: string[]): FakeSource {
  const { sources } = renderApp();
  const source = sources[0] as FakeSource;
  source.emit("open");
  source.emit("hello", {
    sessions: names.map((name, index) => sessionOf(`cc:${index}`, name, { t0: SESSION_START - index * 60_000 })),
  });
  return source;
}

function menu(): HTMLElement {
  const element = document.getElementById("sessMenu");
  if (element === null) {
    throw new Error("Missing run menu");
  }
  return element;
}

function selectedId(): string | undefined {
  return document.getElementById("pane")?.dataset.selectedId;
}

describe("run menu adoption", () => {
  it("opens as a Radix menu with the preserved ids and a consistent label link", () => {
    openWith("First run", "Second run");
    const trigger = screen.getByRole("button", { name: /Switch session/ });
    expect(trigger.id).toBe("runSwitch");
    expect(trigger.className).toContain("runswitch");
    expect(document.getElementById("sessMenu")).toBeNull();
    openRunMenu();
    expect(menu().getAttribute("data-state")).toBe("open");
    expect(menu().hasAttribute("data-radix-menu-content")).toBe(true);
    expect(trigger.getAttribute("aria-controls")).toBe("sessMenu");
    expect(menu().getAttribute("aria-labelledby")).toBe("runSwitch");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
  });

  it("puts focus on the current run's row when opened with the second run current", () => {
    openWith("First run", "Second run");
    fireEvent.keyDown(document.body, { key: "]" });
    expect(document.querySelector(".run-name")?.textContent).toBe("Second run");
    openRunMenu();
    const row = document.activeElement as HTMLElement;
    expect(row.getAttribute("role")).toBe("menuitemradio");
    expect(row.getAttribute("aria-checked")).toBe("true");
    expect(row.dataset.sid).toBe("cc:1");
  });

  it("leaves the page interactive while open: no hiding, inert, pointer lock or scroll lock", () => {
    openWith("First run", "Second run");
    openRunMenu();
    expect(document.querySelectorAll("[data-aria-hidden], [inert]")).toHaveLength(0);
    [...document.body.children].forEach((child) => {
      expect(child.getAttribute("aria-hidden")).toBeNull();
      expect(child.hasAttribute("inert")).toBe(false);
    });
    expect(document.getElementById("garden")?.closest("[aria-hidden]")).toBeNull();
    expect(document.body.style.pointerEvents).not.toBe("none");
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
  });

  it("makes Tab inert inside the menu and closes only when focus moves outside", () => {
    openWith("First run", "Second run");
    const trigger = openRunMenu();
    const row = document.activeElement as HTMLElement;
    const notPrevented = fireEvent.keyDown(row, { key: "Tab" });
    advance(1);
    expect(notPrevented).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(row);
    advance(1);
    act(() => document.getElementById("garden")?.focus());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("does not toggle closed on a trigger click that follows the opening pointer press", () => {
    openWith("First run", "Second run");
    const trigger = openRunMenu();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps focus on the same run when the focused row is blurred by a reorder", () => {
    const source = openWith("First run", "Second run");
    openRunMenu();
    const second = screen.getAllByRole("menuitemradio")[1] as HTMLElement;
    second.focus();
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    source.emit("session", sessionOf("cc:1", "Second run", { t0: SESSION_START + 1000 }));
    advance(10);
    expect((document.activeElement as HTMLElement).dataset.sid).toBe("cc:1");
  });

  it("gates the shortcuts while open and restores them after it closes", () => {
    openWith("First run", "Second run");
    const trigger = openRunMenu();
    fireEvent.keyDown(document.body, { key: "]" });
    expect(document.querySelector(".run-name")?.textContent).toBe("First run");
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    advance(1);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(document.body, { key: "]" });
    expect(document.querySelector(".run-name")?.textContent).toBe("Second run");
  });

  it("closes on Escape without the key reaching the shortcut handler on the wide layout", () => {
    openWith("First run", "Second run");
    expect(selectedId()).toBe("3");
    const trigger = openRunMenu();
    const flushState = () => flushSync(() => undefined);
    const reachedBubble = vi.fn();
    document.addEventListener("keydown", flushState, true);
    document.addEventListener("keydown", reachedBubble);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    document.removeEventListener("keydown", flushState, true);
    document.removeEventListener("keydown", reachedBubble);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(reachedBubble).not.toHaveBeenCalled();
    expect(selectedId()).toBe("3");
  });

  it("still closes the pane on Escape on the narrow layout once the menu is closed", () => {
    stubMatchMedia({ narrow: true });
    openWith("First run");
    expect(document.getElementById("pane")?.className).toBe("pane");
    fireEvent.click(screen.getByRole("button", { name: "1 blocked, show next" }));
    expect(document.getElementById("pane")?.className).toBe("pane open");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.getElementById("pane")?.className).toBe("pane");
  });
});

describe("preserved selectors", () => {
  it("keeps the ids, data attributes and the legend inside the garden", () => {
    openWith("First run");
    expect(document.querySelector("[data-fid]")).not.toBeNull();
    expect(document.querySelector("[data-key]")).not.toBeNull();
    expect(document.querySelector("#pane .back")).not.toBeNull();
    expect(document.querySelector(".skip")).not.toBeNull();
    expect(document.getElementById("runSwitch")).not.toBeNull();
    expect(document.querySelector(".garden .legend")).not.toBeNull();
    openRunMenu();
    expect(document.querySelector("#sessMenu [data-sid]")).not.toBeNull();
  });
});
