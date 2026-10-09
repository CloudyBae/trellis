import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { advance, renderApp, sessionOf, setUpAppTestEnvironment } from "@/test/testSupport";
import { payloadSession } from "@/test/payloadSessions";
import { TreeHarness, treeProps } from "@/test/treeTestSupport";

afterEach(cleanup);

function crumbs(): HTMLElement {
  const element = document.getElementById("crumbs");
  if (element === null) {
    throw new Error("Missing crumbs");
  }
  return element;
}

describe("crumb chain", () => {
  it("lists the selected agent and its parents, root first, with the current one not clickable", () => {
    const session = payloadSession("codex/parent_variants.json");
    render(<TreeHarness {...treeProps(session, { selectedId: 17 })} />);
    expect([...crumbs().querySelectorAll(".crumb")].map((element) => element.textContent)).toEqual([
      "Orchestrator",
      `${session.by[2]?.name}`,
      `${session.by[17]?.name}`,
    ]);
    const current = crumbs().querySelector(".crumb.now");
    expect(current?.tagName).toBe("SPAN");
    expect(current?.getAttribute("aria-current")).toBe("location");
    expect([...crumbs().querySelectorAll("button")].map((button) => button.dataset.crumb)).toEqual(["1", "2"]);
  });

  it("starts from the orchestrator when nothing is selected", () => {
    const session = payloadSession("codex/parent_variants.json");
    render(<TreeHarness {...treeProps(session)} />);
    expect(crumbs().textContent).toBe("Orchestrator");
    expect(crumbs().querySelector("button")).toBeNull();
  });

  it("selects and reveals the agent of a clicked crumb", () => {
    const session = payloadSession("codex/parent_variants.json");
    const props = treeProps(session, { selectedId: 17 });
    render(<TreeHarness {...props} />);
    fireEvent.click(crumbs().querySelector<HTMLElement>('[data-crumb="2"]') as HTMLElement);
    expect(props.onSelect).toHaveBeenCalledWith(2, { reveal: true });
  });
});

describe("crumb hairline", () => {
  function garden(): HTMLElement {
    return document.getElementById("garden") as HTMLElement;
  }

  it("appears once the garden scrolls past two pixels in the timeline view and goes when it returns", () => {
    const session = payloadSession("codex/parent_variants.json");
    render(<TreeHarness {...treeProps(session)} view="timeline" />);
    expect(crumbs().classList.contains("scrolled")).toBe(false);
    garden().scrollTop = 2;
    fireEvent.scroll(garden());
    expect(crumbs().classList.contains("scrolled")).toBe(false);
    garden().scrollTop = 40;
    fireEvent.scroll(garden());
    expect(crumbs().classList.contains("scrolled")).toBe(true);
    garden().scrollTop = 0;
    fireEvent.scroll(garden());
    expect(crumbs().classList.contains("scrolled")).toBe(false);
  });

  it("appears when the tree scrolls inside its own area", () => {
    const session = payloadSession("codex/parent_variants.json");
    render(<TreeHarness {...treeProps(session)} view="tree" />);
    const flow = document.getElementById("flow") as HTMLElement;
    flow.scrollTop = 40;
    fireEvent.scroll(flow);
    expect(crumbs().classList.contains("scrolled")).toBe(true);
  });
});

describe("crumbs inside the app", () => {
  setUpAppTestEnvironment();

  function openRun(): void {
    const { sources } = renderApp();
    sources[0]?.emit("open");
    sources[0]?.emit("hello", { sessions: [sessionOf("cc:a", "First run")] });
  }

  function watchReveals(): ReturnType<typeof vi.fn> {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", { value: scrollIntoView, configurable: true });
    return scrollIntoView;
  }

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  it("selects the agent and reveals its node in the tree view", () => {
    openRun();
    const scrollIntoView = watchReveals();
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("3");
    fireEvent.click(document.querySelector('[data-crumb="1"]') as HTMLElement);
    advance(40);
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("1");
    const revealed = scrollIntoView.mock.contexts.filter((element) => element instanceof HTMLElement && element.dataset.fid === "1");
    expect(revealed).toHaveLength(1);
  });

  it("selects the agent and reveals its row in the timeline view", () => {
    openRun();
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    const row = document.querySelector<HTMLElement>('#rows [data-key="1spawn"]');
    expect(row).not.toBeNull();
    const scrollIntoView = watchReveals();
    fireEvent.click(document.querySelector('[data-crumb="1"]') as HTMLElement);
    advance(40);
    expect(document.getElementById("pane")?.dataset.selectedId).toBe("1");
    expect(scrollIntoView.mock.contexts.filter((element) => element === row)).toHaveLength(1);
  });

  it("shows the hairline when the app garden scrolls in the timeline view", () => {
    openRun();
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    const gardenElement = document.getElementById("garden") as HTMLElement;
    gardenElement.scrollTop = 50;
    act(() => {
      gardenElement.dispatchEvent(new Event("scroll"));
    });
    expect(document.getElementById("crumbs")?.classList.contains("scrolled")).toBe(true);
  });
});
