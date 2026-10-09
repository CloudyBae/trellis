import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { App } from "@/App";
import type { Agent, Session, StreamSource, StreamSourceFactory } from "@/api";

export const SESSION_START = Date.UTC(2026, 8, 28, 12, 0, 0);

export class FakeSource implements StreamSource {
  readonly listeners = new Map<string, (event: Event) => void>();
  closed = false;

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, payload?: unknown): void {
    const listener = this.listeners.get(type);
    if (listener === undefined) {
      throw new Error(`No listener for ${type}`);
    }
    const event =
      payload === undefined ? new Event(type) : new MessageEvent(type, { data: JSON.stringify(payload) });
    act(() => listener(event));
  }
}

export function fakeSourceFactory(): { factory: StreamSourceFactory; sources: FakeSource[] } {
  const sources: FakeSource[] = [];
  const factory: StreamSourceFactory = (url) => {
    const source = new FakeSource(url);
    sources.push(source);
    return source;
  };
  return { factory, sources };
}

export function agentOf(id: number, overrides: Partial<Agent> = {}): Agent {
  return {
    id,
    name: `Agent ${id}`,
    src: "Claude Code",
    start: 0,
    task: `task ${id}`,
    context: [],
    turns: [],
    completeness: "complete",
    ...overrides,
  };
}

export function sessionOf(id: string, name: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    live: true,
    t0: SESSION_START,
    endAt: 30,
    run: { name, repo: "acme/web", source: "Claude Code", file: "file" },
    agents: [
      agentOf(1, { name: "Orchestrator" }),
      agentOf(2, {
        name: "Explorer",
        parent: 1,
        start: 5,
        end: 20,
        final: "complete",
        returned: { summary: "done", items: [] },
      }),
      agentOf(3, {
        name: "Security reviewer",
        parent: 1,
        start: 10,
        phases: [{ at: 15, state: "blocked", note: "Waiting for approval." }],
      }),
      agentOf(4, { name: "Fixer", parent: 1, start: 12 }),
    ],
    ...overrides,
  };
}

type MediaControl = { setDark: (value: boolean) => void; setNarrow: (value: boolean) => void };

export function stubMatchMedia(initial: { dark?: boolean; narrow?: boolean } = {}): MediaControl {
  const values = { dark: initial.dark ?? false, narrow: initial.narrow ?? false };
  const listeners = new Map<string, Set<() => void>>();
  const matchesFor = (query: string): boolean => {
    if (query.includes("prefers-color-scheme")) {
      return values.dark;
    }
    return query.includes("max-width") ? values.narrow : false;
  };
  window.matchMedia = (query: string): MediaQueryList => ({
    get matches() {
      return matchesFor(query);
    },
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      const callback = () => (typeof listener === "function" ? listener(new Event("change")) : undefined);
      listeners.set(query, (listeners.get(query) ?? new Set()).add(callback));
    },
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
  const notify = (): void => {
    act(() => listeners.forEach((set) => set.forEach((callback) => callback())));
  };
  return {
    setDark: (value) => {
      values.dark = value;
      notify();
    },
    setNarrow: (value) => {
      values.narrow = value;
      notify();
    },
  };
}

export class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

class FakePointerEvent extends MouseEvent {}

function installDomStubs(): void {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  if (typeof PointerEvent === "undefined") {
    vi.stubGlobal("PointerEvent", FakePointerEvent);
  }
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
}

export function setUpAppTestEnvironment(): void {
  beforeEach(() => {
    installDomStubs();
    Object.defineProperty(window, "localStorage", { value: new MemoryStorage(), configurable: true });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    vi.setSystemTime(SESSION_START + 30_000);
    document.documentElement.removeAttribute("data-theme");
    window.history.replaceState(null, "", "/");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "matchMedia");
  });
}

export function renderApp(search = ""): { sources: FakeSource[]; container: HTMLElement } {
  if (search) {
    window.history.replaceState(null, "", `/${search}`);
  }
  const { factory, sources } = fakeSourceFactory();
  const { container } = render(<App createSource={factory} />);
  return { sources, container };
}

export function advance(milliseconds: number): void {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

export function openRunMenu(): HTMLElement {
  const trigger = screen.getByRole("button", { name: /Switch session/ });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  return trigger;
}
