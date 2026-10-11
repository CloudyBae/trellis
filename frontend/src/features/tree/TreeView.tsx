import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ViewProps } from "@/lib/viewProps";
import { alive, ended, failedCalls, stateOf } from "@/model";
import type { AgentState, PreparedAgent } from "@/model";
import { Crumbs } from "./Crumbs";
import { TreeEdge } from "./TreeEdge";
import { TreeFold } from "./TreeFold";
import { TreeNode } from "./TreeNode";
import { nodeActivity } from "./nodeText";
import { ROOT_ID, latestPromptAt, placeTree, rootLabelWidthFor } from "./placement";
import type { TreePlacement } from "./placement";
import { useBoxStyle } from "@/hooks/useBoxStyle";
import { useFlowWidth } from "./useFlowWidth";
import { useGlide } from "./useGlide";
import { useLabelReserve } from "./useLabelReserve";
import type { GlideFrame } from "./glide";
import "./tree.css";

function glideFrameFor(
  sessionId: string,
  placement: TreePlacement,
  states: ReadonlyMap<number, AgentState>,
  endedIds: ReadonlySet<number>,
): GlideFrame {
  return {
    sessionId,
    availableWidth: placement.availableWidth,
    nodes: new Map(placement.nodes.map((node) => [node.id, { left: node.left, top: node.top }])),
    paths: new Map(placement.edges.map((edge) => [edge.id, edge.path])),
    states: new Map([...states].map(([id, state]) => [id, state.s])),
    endedEdges: new Set(placement.edges.filter((edge) => endedIds.has(edge.id)).map((edge) => edge.id)),
  };
}

export function TreeView({ session, selectedId, now, narrow, onSelect }: ViewProps) {
  const flowRef = useRef<HTMLDivElement>(null);
  const flowWidth = useFlowWidth(flowRef);
  const { labelReserve, rootLabelReserve, probe } = useLabelReserve(narrow, rootLabelWidthFor(flowWidth ?? 0));
  const [expanded, setExpanded] = useState<{ sessionId: string; promptAt: number } | null>(null);
  const root = session.agents.find((agent) => agent.id === ROOT_ID);
  const promptAt = root === undefined ? -Infinity : latestPromptAt(root, now);
  const foldEarlier = expanded === null || expanded.sessionId !== session.id || expanded.promptAt !== promptAt;
  const placement = useMemo(
    () =>
      placeTree({
        agents: session.agents,
        time: now,
        narrow,
        selectedId,
        flowWidth: flowWidth ?? 0,
        foldEarlier,
        labelReserve,
        rootLabelReserve,
      }),
    [session, now, narrow, selectedId, flowWidth, foldEarlier, labelReserve, rootLabelReserve],
  );
  const agentsById = useMemo(() => {
    const byId = new Map<number, PreparedAgent>();
    session.agents.filter((agent) => alive(agent, now)).forEach((agent) => byId.set(agent.id, agent));
    return byId;
  }, [session, now]);
  const states = useMemo(
    () => new Map([...agentsById].map(([id, agent]) => [id, stateOf(agent, now)])),
    [agentsById, now],
  );
  const endedIds = useMemo(
    () => new Set([...agentsById.values()].filter((agent) => ended(agent, now)).map((agent) => agent.id)),
    [agentsById, now],
  );
  const frame = useMemo(
    () => glideFrameFor(session.id, placement, states, endedIds),
    [session.id, placement, states, endedIds],
  );
  const glide = useGlide(frame, flowWidth);

  useLayoutEffect(() => {
    const flow = flowRef.current;
    if (flow !== null) {
      flow.scrollLeft = 0;
      const garden = flow.closest(".garden");
      if (garden !== null) {
        garden.scrollTop = 0;
      }
    }
  }, [session.id]);
  const sizerRef = useBoxStyle<HTMLDivElement>({ width: placement.width, height: placement.height });
  const innerRef = useBoxStyle<HTMLDivElement>({ width: placement.width, height: placement.height });
  const flowClass = glide.instant ? "flow instant" : "flow";
  const stemsClass = ["fstems", selectedId === null ? "" : "has-sel", glide.moving ? "moving" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <Crumbs session={session} selectedId={selectedId} flowRef={flowRef} onSelect={onSelect} />
      <div
        className={flowClass}
        id="flow"
        role="group"
        aria-label="Agent tree"
        ref={flowRef}
        data-session-id={session.id}
        data-selected-id={selectedId ?? ""}
        data-now={now}
        data-narrow={String(narrow)}
      >
        {probe}
        <div className="flow-sizer" ref={sizerRef}>
          <div className="flow-in" ref={innerRef}>
            <svg
              className={stemsClass}
              width={placement.width}
              height={placement.height}
              viewBox={`0 0 ${placement.width} ${placement.height}`}
              aria-hidden="true"
            >
              {placement.edges.map((edge) => (
                <TreeEdge
                  key={edge.id}
                  edge={edge}
                  shownPath={glide.hold.paths.get(edge.id) ?? edge.path}
                  done={endedIds.has(edge.id) && !glide.hold.settling.has(edge.id)}
                  growing={glide.growing.has(edge.id)}
                  onGrown={glide.finishGrowing}
                />
              ))}
            </svg>
            {placement.fold === null ? null : (
              <TreeFold fold={placement.fold} onExpand={() => setExpanded({ sessionId: session.id, promptAt })} />
            )}
            {placement.nodes.map((node) => {
              const agent = agentsById.get(node.id);
              const state = states.get(node.id);
              if (agent === undefined || state === undefined) {
                return null;
              }
              const held = glide.hold.nodes.get(node.id);
              return (
                <TreeNode
                  key={node.id}
                  agent={agent}
                  state={state.s}
                  shownState={glide.hold.states.get(node.id) ?? state.s}
                  activityText={nodeActivity(agent, state, now, narrow, node.root)}
                  failedCalls={failedCalls(agent, now)}
                  left={held?.left ?? node.left}
                  top={held?.top ?? node.top}
                  width={node.width}
                  root={node.root}
                  selected={selectedId === node.id}
                  popping={glide.popping.has(node.id)}
                  onSelect={(id) => onSelect(id, { focusPane: true })}
                  onPopped={glide.finishPopping}
                />
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
