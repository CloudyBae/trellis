import type { DemoSession } from "../model";
import { buildDemoSession } from "./builders";
import {
  FLAKY_NOW,
  MEMORY_LEAK_NOW,
  NODE_UPGRADE_NOW,
  NOTES_NOW,
  flakyCheckout,
  memoryLeak,
  nodeUpgrade,
  releaseNotes,
} from "./otherRuns";
import { RATE_LIMIT_END, rateLimiting } from "./rateLimiting";
import { ROTATE_NOW, rotateTokens } from "./rotateTokens";

export const DEMO_REPLAY_ID = rateLimiting.id;

export function createDemoSessions(): DemoSession[] {
  return [
    buildDemoSession(rotateTokens, { replay: false, nowAt: ROTATE_NOW, live: true }),
    buildDemoSession(rateLimiting, { replay: true, endAt: RATE_LIMIT_END }),
    buildDemoSession(flakyCheckout, { replay: false, nowAt: FLAKY_NOW, live: true }),
    buildDemoSession(releaseNotes, { replay: false, nowAt: NOTES_NOW, live: true }),
    buildDemoSession(nodeUpgrade, { replay: false, nowAt: NODE_UPGRADE_NOW, live: false }),
    buildDemoSession(memoryLeak, { replay: false, nowAt: MEMORY_LEAK_NOW, live: false }),
  ];
}

export function createReplayDemo(): DemoSession {
  const replay = createDemoSessions().find((session) => session.id === DEMO_REPLAY_ID);
  if (replay === undefined) {
    throw new Error("Missing replay demo");
  }
  return replay;
}
