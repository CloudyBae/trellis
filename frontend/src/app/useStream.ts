import { useEffect } from "react";
import { openStream } from "@/api";
import type { StreamSourceFactory } from "@/api";
import type { AppIntent } from "./appState";
import { useLatest } from "@/hooks/useLatest";

export function useStream(
  enabled: boolean,
  send: (intent: AppIntent) => void,
  createSource?: StreamSourceFactory,
): void {
  const latestSend = useLatest(send);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let helloSeen = false;
    const fail = () => {
      if (!helloSeen) {
        close();
      }
      latestSend.current({ type: "streamError" });
    };
    const close = openStream(
      {
        onHello: (event) => {
          helloSeen = true;
          latestSend.current({ type: "hello", sessions: event.sessions });
        },
        onSession: (session) => latestSend.current({ type: "session", session }),
        onRemove: (event) => latestSend.current({ type: "remove", id: event.id }),
        onConnectFailed: fail,
        onLinkLost: fail,
      },
      createSource,
    );
    return close;
  }, [enabled, createSource, latestSend]);
}
