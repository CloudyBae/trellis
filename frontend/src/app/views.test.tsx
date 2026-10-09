import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SESSION_START, advance, openRunMenu, renderApp, sessionOf, stubMatchMedia, setUpAppTestEnvironment } from "@/test/testSupport";

setUpAppTestEnvironment();

function openServedRun(): void {
  const { sources } = renderApp();
  sources[0]?.emit("open");
  sources[0]?.emit("hello", { sessions: [sessionOf("cc:a", "First run")] });
}

function garden(): HTMLElement {
  const element = document.getElementById("garden");
  if (element === null) {
    throw new Error("Missing garden");
  }
  return element;
}

function pressed(): string[] {
  return screen
    .getAllByRole("button", { name: /^(Tree|Timeline)$/ })
    .filter((button) => button.getAttribute("aria-pressed") === "true")
    .map((button) => button.textContent ?? "");
}

describe("view toggle", () => {
  it("defaults to the tree and stores the choice under trellis:view", () => {
    openServedRun();
    expect(garden().dataset.view).toBe("tree");
    expect(pressed()).toEqual(["Tree"]);
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    expect(garden().dataset.view).toBe("timeline");
    expect(pressed()).toEqual(["Timeline"]);
    expect(window.localStorage.getItem("trellis:view")).toBe("timeline");
    expect(window.location.hash).toBe("#timeline");
  });

  it("keeps both views mounted and changes only data-view and aria-pressed", () => {
    openServedRun();
    const tree = document.getElementById("flow");
    const timeline = document.getElementById("graph");
    const pane = document.getElementById("pane");
    const treeMarkup = tree?.outerHTML;
    const timelineMarkup = timeline?.outerHTML;
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    expect(document.getElementById("flow")).toBe(tree);
    expect(document.getElementById("graph")).toBe(timeline);
    expect(document.getElementById("pane")).toBe(pane);
    expect(tree?.outerHTML).toBe(treeMarkup);
    expect(timeline?.outerHTML).toBe(timelineMarkup);
    expect(document.querySelector(".legend-note")?.textContent).toContain("Lanes fork");
    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    expect(document.getElementById("graph")).toBe(timeline);
  });

  it("restores the stored choice on mount", () => {
    window.localStorage.setItem("trellis:view", "timeline");
    openServedRun();
    expect(garden().dataset.view).toBe("timeline");
    expect(pressed()).toEqual(["Timeline"]);
  });

  it("lets the hash win over the stored choice", () => {
    window.localStorage.setItem("trellis:view", "timeline");
    window.history.replaceState(null, "", "/#tree");
    openServedRun();
    expect(garden().dataset.view).toBe("tree");
  });

  it("ignores a stored value that is not a view", () => {
    window.localStorage.setItem("trellis:view", "grid");
    openServedRun();
    expect(garden().dataset.view).toBe("tree");
  });
});

describe("views and pane", () => {
  it("mounts the tree, timeline and pane with the typed props", () => {
    openServedRun();
    const tree = document.getElementById("flow");
    const timeline = document.getElementById("graph");
    const pane = document.getElementById("pane");
    [tree, timeline, pane].forEach((element) => {
      expect(element?.dataset.sessionId).toBe("cc:a");
      expect(element?.dataset.selectedId).toBe("3");
      expect(element?.dataset.now).toBe("30");
      expect(element?.dataset.narrow).toBe("false");
    });
    expect(pane?.classList.contains("open")).toBe(true);
    advance(2000);
    expect(document.getElementById("flow")?.dataset.now).toBe("32");
  });

  it("passes the narrow flag and starts with no selection on a narrow screen", () => {
    stubMatchMedia({ narrow: true });
    openServedRun();
    expect(document.getElementById("pane")?.dataset.narrow).toBe("true");
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("");
    expect(document.getElementById("pane")?.classList.contains("open")).toBe(false);
  });
});

describe("keyboard", () => {
  it("n jumps to the next agent that needs a human and announces a run with none", () => {
    openServedRun();
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("4");
    fireEvent.keyDown(document.body, { key: "n" });
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("3");
    advance(40);
    expect(screen.getByRole("status").textContent).toBe("Security reviewer, blocked");
  });

  it("n says so when nothing needs you", () => {
    const { sources } = renderApp();
    sources[0]?.emit("open");
    const calm = sessionOf("cc:a", "Calm run");
    calm.agents = calm.agents.filter((agent) => agent.id !== 3);
    sources[0]?.emit("hello", { sessions: [calm] });
    fireEvent.keyDown(document.body, { key: "n" });
    advance(40);
    expect(screen.getByRole("status").textContent).toBe("Nothing in this run needs you");
  });

  it("n does nothing inside the pane", () => {
    openServedRun();
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    fireEvent.keyDown(document.getElementById("pane") as HTMLElement, { key: "n" });
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("4");
  });

  it("moves with the arrow keys and j and k, and Escape returns to the orchestrator", () => {
    openServedRun();
    fireEvent.keyDown(document.body, { key: "k" });
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("2");
    fireEvent.keyDown(document.body, { key: "j" });
    fireEvent.keyDown(document.body, { key: "j" });
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("4");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("1");
  });

  it("ignores keys with a modifier", () => {
    openServedRun();
    fireEvent.keyDown(document.body, { key: "ArrowDown", metaKey: true });
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("3");
  });

  it("closes the sheet with Escape on a narrow screen", () => {
    stubMatchMedia({ narrow: true });
    openServedRun();
    fireEvent.click(screen.getByRole("button", { name: "1 blocked, show next" }));
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("3");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("");
  });

  it("the skip link focuses an agent target when a view provides one", () => {
    openServedRun();
    fireEvent.click(screen.getByRole("link", { name: "Skip to the graph" }));
    expect(document.activeElement).toBe(document.querySelector('#flow [data-fid="1"]'));
  });

  it("the skip link falls back to the graph region and follows the active view", () => {
    openServedRun();
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    const spawnRows = [...document.querySelectorAll<HTMLElement>('#rows [data-key$="spawn"]')];
    expect(spawnRows.length).toBeGreaterThan(0);
    spawnRows.forEach((row) => row.removeAttribute("data-key"));
    fireEvent.click(screen.getByRole("link", { name: "Skip to the graph" }));
    expect(document.activeElement).toBe(garden());

    spawnRows.forEach((row, index) => row.setAttribute("data-key", `${index + 1}spawn`));
    fireEvent.click(screen.getByRole("link", { name: "Skip to the graph" }));
    expect(document.activeElement).toBe(spawnRows[0]);
    expect(spawnRows[0]?.dataset.key).toBe("1spawn");
  });

  it("n focuses the agent target of the active view", () => {
    openServedRun();
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    fireEvent.keyDown(document.body, { key: "n" });
    expect(document.activeElement).toBe(document.querySelector('#flow [data-fid="3"]'));
  });
});

describe("keyboard while the run menu is open", () => {
  it("ignores selection and session keys and still closes on Escape", () => {
    const { sources } = renderApp();
    sources[0]?.emit("open");
    sources[0]?.emit("hello", {
      sessions: [sessionOf("cc:a", "First run"), sessionOf("cc:b", "Second run", { t0: SESSION_START - 60_000 })],
    });
    const trigger = openRunMenu();
    const row = screen.getAllByRole("menuitemradio")[0] as HTMLElement;
    ["j", "k", "n", "]", "[", "ArrowDown", "ArrowUp"].forEach((key) => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key });
    });
    fireEvent.keyDown(document.body, { key: "j" });
    fireEvent.keyDown(document.body, { key: "]" });
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("3");
    expect(document.querySelector(".run-name")?.textContent).toBe("First run");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(row).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
