import { describe, expect, it } from "vitest";
import { openStream, type StreamCallbacks, type StreamSource } from "./index";

class FakeSource implements StreamSource {
  readonly listeners = new Map<string, (event: Event) => void>();
  closed = false;

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data?: string): void {
    const listener = this.listeners.get(type);
    if (listener === undefined) {
      throw new Error(`No listener for ${type}`);
    }
    listener(data === undefined ? new Event(type) : new MessageEvent(type, { data }));
  }
}

const session = {
  id: "cc:one",
  live: true,
  t0: 10,
  endAt: 5,
  run: { name: "run", repo: "repo", source: "Claude Code", file: "file" },
  agents: [
    {
      id: 1,
      name: "Orchestrator",
      src: "Claude Code",
      start: 0,
      task: "task",
      context: [],
      turns: [{ at: 1, kind: "msg", text: "hello" }],
      completeness: "complete",
    },
  ],
};

function openFake() {
  const events: string[] = [];
  const sources: FakeSource[] = [];
  const callbacks: StreamCallbacks = {
    onHello: (event) => events.push(`hello:${event.sessions.length}`),
    onSession: (received) => events.push(`session:${received.id}`),
    onRemove: (event) => events.push(`remove:${event.id}`),
    onConnectFailed: () => events.push("connect-failed"),
    onLinkLost: () => events.push("link-lost"),
  };
  const close = openStream(callbacks, (url) => {
    const source = new FakeSource(url);
    sources.push(source);
    return source;
  });
  const source = sources[0];
  if (source === undefined || sources.length !== 1) {
    throw new Error("Expected exactly one source");
  }
  return { events, source, close };
}

describe("openStream", () => {
  it("opens one relative source and delivers valid events", () => {
    const { events, source } = openFake();
    expect(source.url).toBe("api/stream");
    source.emit("open");
    source.emit("hello", JSON.stringify({ sessions: [session] }));
    source.emit("session", JSON.stringify(session));
    source.emit("remove", JSON.stringify({ id: "cc:one" }));
    expect(events).toEqual(["hello:1", "session:cc:one", "remove:cc:one"]);
  });

  it("drops invalid and unparsable payloads", () => {
    const { events, source } = openFake();
    source.emit("open");
    source.emit("hello", JSON.stringify({ sessions: [{ id: "x" }] }));
    source.emit("session", JSON.stringify({ ...session, agents: undefined }));
    source.emit("remove", JSON.stringify({ id: 3 }));
    source.emit("session", "not json");
    expect(events).toEqual([]);
  });

  it("reports first-connect failure and later link loss distinctly", () => {
    const first = openFake();
    first.source.emit("error");
    expect(first.events).toEqual(["connect-failed"]);

    const second = openFake();
    second.source.emit("open");
    second.source.emit("error");
    expect(second.events).toEqual(["link-lost"]);
  });

  it("closes the source", () => {
    const { source, close } = openFake();
    close();
    expect(source.closed).toBe(true);
  });
});
