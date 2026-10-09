import { parseHello, parseRemove, parseSession } from "./guards";
import type { HelloEvent, RemoveEvent, Session } from "./types";

export const STREAM_URL = "api/stream";

export interface StreamCallbacks {
  onHello: (event: HelloEvent) => void;
  onSession: (session: Session) => void;
  onRemove: (event: RemoveEvent) => void;
  onConnectFailed: () => void;
  onLinkLost: () => void;
}

export interface StreamSource {
  addEventListener(type: string, listener: (event: Event) => void): void;
  close(): void;
}

export type StreamSourceFactory = (url: string) => StreamSource;

function createBrowserSource(url: string): StreamSource {
  return new EventSource(url);
}

function readPayload(event: Event): unknown {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") {
    return null;
  }
  try {
    const payload: unknown = JSON.parse(event.data);
    return payload;
  } catch {
    return null;
  }
}

export function openStream(
  callbacks: StreamCallbacks,
  createSource: StreamSourceFactory = createBrowserSource,
): () => void {
  const source = createSource(STREAM_URL);
  let hasConnected = false;

  source.addEventListener("open", () => {
    hasConnected = true;
  });
  source.addEventListener("error", () => {
    if (hasConnected) {
      callbacks.onLinkLost();
    } else {
      callbacks.onConnectFailed();
    }
  });
  source.addEventListener("hello", (event) => {
    const hello = parseHello(readPayload(event));
    if (hello !== null) {
      callbacks.onHello(hello);
    }
  });
  source.addEventListener("session", (event) => {
    const session = parseSession(readPayload(event));
    if (session !== null) {
      callbacks.onSession(session);
    }
  });
  source.addEventListener("remove", (event) => {
    const removal = parseRemove(readPayload(event));
    if (removal !== null) {
      callbacks.onRemove(removal);
    }
  });

  return () => source.close();
}
