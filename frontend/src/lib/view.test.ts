import { describe, expect, it } from "vitest";
import { VIEW_STORAGE_KEY, readView, writeView } from "./view";
import type { ViewStorage } from "./view";

function memoryStorage(initial: Record<string, string> = {}): ViewStorage & { values: Record<string, string> } {
  const values = { ...initial };
  return {
    values,
    getItem: (key) => values[key] ?? null,
    setItem: (key, value) => {
      values[key] = value;
    },
  };
}

const throwingStorage: ViewStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("readView", () => {
  it("defaults to the tree", () => {
    expect(readView(memoryStorage(), "")).toBe("tree");
  });

  it("uses the stored view", () => {
    expect(readView(memoryStorage({ [VIEW_STORAGE_KEY]: "timeline" }), "")).toBe("timeline");
  });

  it("falls back to the tree when storage throws", () => {
    expect(readView(throwingStorage, "")).toBe("tree");
  });

  it("ignores a stored value that is not a view", () => {
    expect(readView(memoryStorage({ [VIEW_STORAGE_KEY]: "grid" }), "")).toBe("tree");
  });

  it("lets the hash override the stored view", () => {
    const storage = memoryStorage({ [VIEW_STORAGE_KEY]: "tree" });
    expect(readView(storage, "#timeline")).toBe("timeline");
    expect(readView(memoryStorage({ [VIEW_STORAGE_KEY]: "timeline" }), "#tree")).toBe("tree");
  });

  it("honors the hash even when storage throws, and ignores other hashes", () => {
    expect(readView(throwingStorage, "#timeline")).toBe("timeline");
    expect(readView(memoryStorage({ [VIEW_STORAGE_KEY]: "timeline" }), "#other")).toBe("timeline");
  });
});

describe("writeView", () => {
  it("stores the chosen view", () => {
    const storage = memoryStorage();
    writeView(storage, "timeline");
    expect(storage.values[VIEW_STORAGE_KEY]).toBe("timeline");
  });

  it("does not throw when storage refuses the write", () => {
    expect(() => writeView(throwingStorage, "tree")).not.toThrow();
  });
});
