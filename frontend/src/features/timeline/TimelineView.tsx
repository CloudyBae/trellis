import { useLayoutEffect, useMemo } from "react";
import type { ViewProps } from "@/lib/viewProps";
import { alive, ancestry, ended, layout } from "@/model";
import type { Layout } from "@/model";
import type { View } from "@/lib/view";
import { NowRow, ReturnRow, SpawnRow } from "./TimelineRows";
import { TimelineStems } from "./TimelineStems";
import { alignLoops } from "./alignLoops";
import { hasReturned, stemGeometry } from "./stemGeometry";
import { useBoxStyle } from "@/hooks/useBoxStyle";
import { useFollow } from "./useFollow";
import { useStemMotion } from "./useStemMotion";
import "./timeline.css";

const TEXT_INSET = 12;
const NO_LIT: ReadonlySet<number> = new Set();

type TimelineBodyProps = ViewProps & {
  placed: Layout;
  active: boolean;
  follow: boolean;
  onFollow: () => void;
};

function TimelineBody({ session, selectedId, now, narrow, onSelect, placed, active, follow, onFollow }: TimelineBodyProps) {
  const stems = useMemo(() => stemGeometry(session.agents, now, placed, narrow), [session, now, placed, narrow]);
  const returnedIds = useMemo(() => hasReturned(session.agents, now), [session, now]);
  const motion = useStemMotion(
    {
      stemKeys: stems.flatMap((stem) => stem.paths.map((path) => path.key)),
      glyphKeys: stems.map((stem) => stem.glyphKey),
      returnedIds,
    },
    active,
  );
  const lit = selectedId === null ? NO_LIT : ancestry(session.by, selectedId);
  const showSource = new Set(session.agents.map((agent) => agent.src)).size > 1;
  const growing = session.agents.filter((agent) => alive(agent, now) && !ended(agent, now)).length;
  const rowsRef = useBoxStyle<HTMLDivElement>({ height: placed.height });
  const paddingLeft = placed.textX - TEXT_INSET;
  const select = (id: number) => onSelect(id, { focusPane: true });

  useLayoutEffect(() => {
    alignLoops();
  });

  return (
    <>
      <TimelineStems
        stems={stems}
        width={placed.textX}
        height={placed.height}
        maxLane={placed.maxLane}
        narrow={narrow}
        hasSelection={selectedId !== null}
        lit={lit}
        motion={motion}
      />
      <div className="rows" id="rows" role="list" ref={rowsRef}>
        {placed.rows.map((row) => {
          const box = { top: row.y, height: row.h, paddingLeft };
          if (row.type === "now") {
            return (
              <NowRow
                key="now"
                session={session}
                box={box}
                now={now}
                growing={growing}
                follow={follow}
                onFollow={onFollow}
              />
            );
          }
          const selected = selectedId === row.a.id;
          return row.type === "spawn" ? (
            <SpawnRow
              key={`${row.a.id}spawn`}
              agent={row.a}
              box={box}
              now={now}
              selected={selected}
              showSource={showSource}
              onSelect={select}
            />
          ) : (
            <ReturnRow
              key={`${row.a.id}ret`}
              agent={row.a}
              box={box}
              selected={selected}
              onSelect={select}
              session={session}
            />
          );
        })}
      </div>
    </>
  );
}

export function TimelineView({ view, ...props }: ViewProps & { view: View }) {
  const { session, selectedId, now, narrow } = props;
  const placed = useMemo(() => layout(session.agents, now, narrow, selectedId), [session, now, narrow, selectedId]);
  const graphRef = useBoxStyle<HTMLDivElement>({ height: placed.height });
  const { follow, resume } = useFollow(graphRef, session.id, view, selectedId);
  return (
    <div
      className="graph"
      id="graph"
      ref={graphRef}
      data-session-id={session.id}
      data-selected-id={selectedId ?? ""}
      data-now={now}
      data-narrow={String(narrow)}
    >
      <TimelineBody key={session.id} {...props} placed={placed} active={view === "timeline"} follow={follow} onFollow={resume} />
    </div>
  );
}
