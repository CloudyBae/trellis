import { describe, expect, it } from "vitest";
import type { Session } from "@/api";
import type { AppIntent, AppState } from "./appState";
import { createInitialState, isServed, reduceApp, wantsEmpty } from "./appState";
import type { ShellEnvironment } from "@/lib/clock";
import { SESSION_START, agentOf, sessionOf } from "@/test/testSupport";

const env: ShellEnvironment = { clockMs: SESSION_START + 30_000, tick: 40, narrow: false };
const served = { protocol: "http:", search: "", hash: "" };

function run(state: AppState, intent: AppIntent, overrides: Partial<ShellEnvironment> = {}): AppState {
  return reduceApp(state, { env: { ...env, ...overrides }, intent });
}

function ids(state: AppState): string[] {
  return state.store.sessions.map((session) => session.id);
}

describe("location rules", () => {
  it("serves over http and https unless ?demo is present", () => {
    expect(isServed(served)).toBe(true);
    expect(isServed({ ...served, protocol: "https:" })).toBe(true);
    expect(isServed({ ...served, protocol: "file:" })).toBe(false);
    expect(isServed({ ...served, search: "?demo" })).toBe(false);
    expect(isServed({ ...served, search: "?other=1" })).toBe(true);
  });

  it("reads empty from the hash or the query", () => {
    expect(wantsEmpty({ ...served, hash: "#empty" })).toBe(true);
    expect(wantsEmpty({ ...served, search: "?empty" })).toBe(true);
    expect(wantsEmpty({ ...served, hash: "#timeline" })).toBe(false);
  });

  it("starts served pages empty, file pages on the demo runs, and previews empty on request", () => {
    expect(createInitialState(served, env).store.current).toBeNull();
    const file = createInitialState({ ...served, protocol: "file:" }, env);
    expect(file.store.current?.id).toBe("rotate");
    expect(file.selectedId).toBe(7);
    const preview = createInitialState({ protocol: "file:", search: "", hash: "#empty" }, env);
    expect(preview.emptyMode).toBe(true);
    expect(preview.store.sessions).toEqual([]);
  });
});

describe("stream intents", () => {
  const first = sessionOf("cc:a", "First");

  it("opens the first run on hello and picks the blocked agent", () => {
    const next = run(createInitialState(served, env), { type: "hello", sessions: [first] });
    expect(next.store.current?.id).toBe("cc:a");
    expect(next.selectedId).toBe(3);
    expect(next.connected).toBe(true);
  });

  it("keeps a running demo open across hello", () => {
    const started = run(createInitialState(served, env), { type: "startDemo" });
    const next = run(started, { type: "hello", sessions: [first] });
    expect(next.store.current?.id).toBe("research");
    expect(ids(next)).toEqual(["cc:a", "research"]);
  });

  it("keeps the open real run and its selection when hello no longer lists it", () => {
    const opened = run(createInitialState(served, env), { type: "hello", sessions: [first] });
    const moved = run(opened, { type: "select", id: 4 });
    const next = run(moved, { type: "hello", sessions: [sessionOf("cc:b", "Other")] });
    expect(next.store.current?.id).toBe("cc:a");
    expect(next.selectedId).toBe(4);
  });

  it("treats an error before hello as unreachable and after hello as link loss", () => {
    const unreachable = run(createInitialState(served, env), { type: "streamError" });
    expect(unreachable.unreachable).toBe(true);
    expect(unreachable.served).toBe(true);
    expect(ids(unreachable)).toEqual([]);
    expect(unreachable.store.current).toBeNull();

    const connected = run(createInitialState(served, env), { type: "hello", sessions: [first] });
    const lost = run(connected, { type: "streamError" });
    expect(lost.linkDown).toBe(true);
    expect(lost.served).toBe(true);
    expect(lost.store).toBe(connected.store);
  });

  it("does not duplicate a demo that is already running when unreachable", () => {
    const started = run(createInitialState(served, env), { type: "startDemo" });
    const next = run(started, { type: "streamError" });
    expect(next.unreachable).toBe(true);
    expect(next.store.current?.id).toBe("research");
    expect(ids(next).filter((id) => id === "research")).toHaveLength(1);
  });

  it("restarts the replay demo at the current tick", () => {
    const started = run(createInitialState(served, env), { type: "startDemo" }, { tick: 55 });
    const restarted = run(started, { type: "open", id: "research", announce: false }, { tick: 90 });
    const current = restarted.store.current;
    expect(current && !current.real && current.t0).toBe(90);
  });

  it("removing the open run opens the first remaining run in display order", () => {
    const hello: Session[] = [
      first,
      sessionOf("cc:old", "Old", { t0: SESSION_START - 900_000 }),
      sessionOf("cc:new", "New", { t0: SESSION_START - 10_000 }),
    ];
    const opened = run(createInitialState(served, env), { type: "hello", sessions: hello });
    const next = run(opened, { type: "remove", id: "cc:a" });
    expect(next.store.current?.id).toBe("cc:new");
  });

  it("keeps selection on an update to the open run unless the agent is gone", () => {
    const opened = run(createInitialState(served, env), { type: "hello", sessions: [first] });
    const moved = run(opened, { type: "select", id: 4 });
    const updated = run(moved, { type: "session", session: { ...first, endAt: 50 } });
    expect(updated.selectedId).toBe(4);
    const shrunk = run(moved, {
      type: "session",
      session: { ...first, agents: [agentOf(1, { name: "Orchestrator" })] },
    });
    expect(shrunk.selectedId).toBe(1);
  });

  it("selects nothing by default on a narrow screen", () => {
    const next = run(createInitialState(served, env), { type: "hello", sessions: [first] }, { narrow: true });
    expect(next.selectedId).toBeNull();
  });
});
