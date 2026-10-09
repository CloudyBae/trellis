import { useLayoutEffect, useRef } from "react";
import type { PaneProps } from "@/lib/viewProps";
import { stateOf } from "@/model";
import { Conversation } from "./Conversation";
import { TokenUsage } from "./TokenUsage";
import { Handoff } from "./Handoff";
import { IdentityHeader } from "./IdentityHeader";
import { KidsList } from "./KidsList";
import { SourceFooter } from "./SourceFooter";
import "./pane.css";

export function AgentPane({ session, selectedId, now, narrow, onSelect, onClose }: PaneProps) {
  const paneRef = useRef<HTMLElement>(null);
  const agent = selectedId === null ? undefined : session.by[selectedId];
  const agentId = agent?.id;

  useLayoutEffect(() => {
    if (paneRef.current !== null) {
      paneRef.current.scrollTop = 0;
    }
  }, [agentId, session.id]);

  const parent = agent?.parent == null ? undefined : session.by[agent.parent];
  const state = agent === undefined ? undefined : stateOf(agent, now);

  function goTo(id: number): void {
    onSelect(id, { reveal: true });
    if (paneRef.current !== null) {
      paneRef.current.scrollTop = 0;
    }
  }

  return (
    <aside
      className={agent === undefined ? "pane" : "pane open"}
      id="pane"
      aria-label="Agent details"
      ref={paneRef}
      data-session-id={session.id}
      data-selected-id={selectedId ?? ""}
      data-now={now}
      data-narrow={String(narrow)}
    >
      {agent !== undefined && state !== undefined ? (
        <div className="pane-in" key={`${session.id}:${agent.id}`}>
          <IdentityHeader
            agent={agent}
            parent={parent}
            session={session}
            state={state}
            now={now}
            onClose={onClose}
            onGo={goTo}
          />
          <Handoff agent={agent} parent={parent} session={session} now={now} />
          <KidsList agent={agent} now={now} onGo={goTo} />
          <TokenUsage agent={agent} />
          <Conversation agent={agent} parent={parent} now={now} onGo={goTo} />
          <SourceFooter session={session} agent={agent} />
        </div>
      ) : null}
    </aside>
  );
}
