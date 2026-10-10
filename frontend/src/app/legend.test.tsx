import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "@/test/testSupport";
import { Legend } from "./Legend";

function useStorage(storage: unknown): void {
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
}

const BLOCKED_STORAGE = {
  getItem(): never {
    throw new Error("blocked");
  },
  setItem(): never {
    throw new Error("blocked");
  },
  removeItem(): never {
    throw new Error("blocked");
  },
};

function toggle(): HTMLElement {
  return screen.getByRole("button", { name: "How to read" });
}

function detail(): HTMLElement {
  const element = document.getElementById("legend-detail");
  if (element === null) {
    throw new Error("Missing legend detail");
  }
  return element;
}

beforeEach(() => {
  useStorage(new MemoryStorage());
});

afterEach(() => {
  cleanup();
});

describe("legend fold", () => {
  it("starts expanded with the toggle controlling the second row", () => {
    render(<Legend view="tree" />);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(toggle().getAttribute("aria-controls")).toBe("legend-detail");
    expect(detail().hidden).toBe(false);
    expect(detail().textContent).toContain("Icons show role");
  });

  it("collapses the second row and keeps the first row", () => {
    render(<Legend view="tree" />);
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(detail().hidden).toBe(true);
    expect(screen.getByText("running")).toBeTruthy();
    expect(screen.getByText("failed call")).toBeTruthy();
  });

  it("stores only the collapsed state under trellis:legend", () => {
    render(<Legend view="timeline" />);
    fireEvent.click(toggle());
    expect(window.localStorage.getItem("trellis:legend")).toBe("collapsed");
    fireEvent.click(toggle());
    expect(window.localStorage.getItem("trellis:legend")).toBeNull();
    expect(detail().hidden).toBe(false);
  });

  it("restores the collapsed state on remount", () => {
    const { unmount } = render(<Legend view="tree" />);
    fireEvent.click(toggle());
    unmount();
    render(<Legend view="tree" />);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(detail().hidden).toBe(true);
  });

  it("renders expanded and still toggles when storage access throws", () => {
    useStorage(BLOCKED_STORAGE);
    render(<Legend view="tree" />);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(detail().hidden).toBe(true);
    fireEvent.click(toggle());
    expect(detail().hidden).toBe(false);
  });
});
