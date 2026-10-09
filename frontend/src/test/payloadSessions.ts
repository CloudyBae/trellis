import type { Session } from "@/api";
import { toRealSession } from "@/model";
import type { RealSession } from "@/model";
import { loadPayloadFiles } from "@/model/payloadFixtures";

export function payloadSource(fileName: string, snapshot = 0): Session {
  const file = loadPayloadFiles().find((candidate) => candidate.name === fileName);
  const session = file?.sessions[snapshot];
  if (session === undefined) {
    throw new Error(`No payload session ${fileName}#${snapshot}`);
  }
  return session;
}

export function payloadSession(
  fileName: string,
  snapshot = 0,
  edit: (session: Session) => Session = (session) => session,
  revision = 1,
): RealSession {
  return toRealSession(edit(payloadSource(fileName, snapshot)), revision);
}

export function withAgents(session: Session, agents: Session["agents"]): Session {
  return { ...session, agents: [...session.agents, ...agents] };
}
