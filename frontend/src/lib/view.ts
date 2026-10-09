export type View = "tree" | "timeline";

export type ViewStorage = Pick<Storage, "getItem" | "setItem">;

export const VIEW_STORAGE_KEY = "trellis:view";

const DEFAULT_VIEW: View = "tree";

function asView(value: string | null): View | null {
  return value === "tree" || value === "timeline" ? value : null;
}

function storedView(storage: ViewStorage): View | null {
  try {
    return asView(storage.getItem(VIEW_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function readView(storage: ViewStorage, hash: string): View {
  const fromHash = hash.startsWith("#") ? asView(hash.slice(1)) : null;
  return fromHash ?? storedView(storage) ?? DEFAULT_VIEW;
}

export function writeView(storage: ViewStorage, view: View): void {
  try {
    storage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    return;
  }
}
