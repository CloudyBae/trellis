import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { advance, openRunMenu, renderApp, sessionOf, setUpAppTestEnvironment } from "@/test/testSupport";

setUpAppTestEnvironment();

describe("first run", () => {
  it("starts empty when served and offers only the brand and theme toggle", () => {
    renderApp();
    expect(screen.getByRole("heading", { name: "Nothing growing yet" })).toBeTruthy();
    expect(document.querySelector(".app")?.classList.contains("is-empty")).toBe(true);
    expect(document.querySelector(".run")).toBeNull();
    expect(document.querySelector(".counts")).toBeNull();
    expect(screen.queryByRole("link", { name: "Skip to the graph" })).toBeNull();
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
  });

  it("previews the empty state from the hash on a page that shows the demo runs", () => {
    renderApp("?demo");
    expect(document.querySelector(".run-name")?.textContent).toBe("Rotate session tokens");
    window.history.replaceState(null, "", "/?demo#empty");
    fireEvent(window, new HashChangeEvent("hashchange"));
    expect(screen.getByRole("heading", { name: "Nothing growing yet" })).toBeTruthy();
    expect(document.querySelector(".run")).toBeNull();
  });

  it("starts empty for ?demo&empty and offers Close demo once the demo runs", () => {
    renderApp("?demo&empty");
    fireEvent.click(screen.getByRole("button", { name: "Watch a demo run" }));
    expect(screen.getByRole("button", { name: "Close demo" })).toBeTruthy();
  });
});

describe("demo run", () => {
  it("starts from the empty state, replays and closes back to it", () => {
    const { sources } = renderApp();
    sources[0]?.emit("open");
    sources[0]?.emit("hello", { sessions: [] });
    fireEvent.click(screen.getByRole("button", { name: "Watch a demo run" }));
    expect(document.querySelector(".run-name")?.textContent).toBe("Add rate limiting to our API");
    expect(screen.getByText("synthetic demo")).toBeTruthy();
    expect(document.querySelector(".app")?.classList.contains("is-empty")).toBe(false);

    advance(10_000);
    expect(document.querySelector(".run-meta .tnum")?.textContent).toBe("10s");
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(document.querySelector(".run-meta .tnum")?.textContent).toBe("0s");

    fireEvent.click(screen.getByRole("button", { name: "Close demo" }));
    expect(screen.getByRole("heading", { name: "Nothing growing yet" })).toBeTruthy();
    expect(document.activeElement).toBe(document.getElementById("demoBtn"));
  });

  it("closes to the first real run when one exists", () => {
    const { sources } = renderApp();
    sources[0]?.emit("open");
    sources[0]?.emit("hello", { sessions: [sessionOf("cc:a", "Real run")] });
    openRunMenu();
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(1);
    sources[0]?.emit("remove", { id: "cc:a" });
    fireEvent.click(screen.getByRole("button", { name: "Watch a demo run" }));
    sources[0]?.emit("session", sessionOf("cc:b", "Later run"));
    fireEvent.click(screen.getByRole("button", { name: "Close demo" }));
    expect(document.querySelector(".run-name")?.textContent).toBe("Later run");
    expect(document.activeElement).toBe(document.getElementById("runSwitch"));
  });

  it("shows the demo runs without a server when the page asks for them", () => {
    renderApp("?demo");
    openRunMenu();
    const names = screen.getAllByRole("menuitemradio").map((row) => row.querySelector(".s-name")?.textContent);
    expect(names).toEqual([
      "Rotate session tokens",
      "Add rate limiting to our API",
      "Fix flaky checkout test",
      "Draft release notes for v2.4",
      "Upgrade to Node 22",
      "Investigate worker memory leak",
    ]);
    expect(screen.queryByRole("button", { name: "Close demo" })).toBeNull();
  });
});
