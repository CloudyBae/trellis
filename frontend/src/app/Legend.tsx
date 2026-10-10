import type { LeafState } from "@/model";
import type { View } from "@/lib/view";
import { StateGlyph } from "@/components/agent/StateGlyph";
import { ToolLeaf } from "@/components/agent/ToolLeaf";
import { useLegendFold } from "./useLegendFold";

const LEAF_VIEW_BOX = "-1 -5 14 10";

const CALL_KEYS: { state: LeafState; label: string }[] = [
  { state: "ok", label: "tool call" },
  { state: "failed", label: "failed call" },
  { state: "pending", label: "running call" },
];

const LEGEND_NOTE: Record<View, string> = {
  tree: "Icons show role, badges show state. Bright stems are working; faded ones have returned. A stem shows up to four calls, ×N is the total, and a rose leaf is a failed call (the agent can still finish). A number tells same-role agents apart under one parent.",
  timeline: "Lanes fork on delegation and rejoin on return. Bright is working, faded has returned. A lane shows up to four calls, ×N is the total.",
};

const LEGEND_ITEM = "inline-flex items-center gap-xs [&_svg]:size-icon-s";

function Key({ children }: { children: string }) {
  return <kbd className="rounded-key bg-ground-2 px-xs font-mono text-xs font-medium text-ink-2">{children}</kbd>;
}

const STATES = ["running", "waiting", "blocked", "failed", "complete"] as const;

const DETAIL_ID = "legend-detail";

export function Legend({ view }: { view: View }) {
  const { collapsed, toggle } = useLegendFold();
  return (
    <div
      className="legend flex flex-none flex-wrap items-center gap-x-md gap-y-xs border-t border-rule bg-ground px-lg pt-m pb-m text-note text-ink-3"
      aria-label="How to read the graph"
    >
      {STATES.map((state) => (
        <span key={state} className={LEGEND_ITEM}>
          <StateGlyph state={state} />
          {state}
        </span>
      ))}
      {CALL_KEYS.map(({ state, label }) => (
        <span key={state} className={LEGEND_ITEM}>
          <svg viewBox={LEAF_VIEW_BOX}>
            <ToolLeaf state={state} />
          </svg>
          {label}
        </span>
      ))}
      <button type="button" className="legend-toggle" aria-expanded={!collapsed} aria-controls={DETAIL_ID} onClick={toggle}>
        How to read
      </button>
      <div id={DETAIL_ID} className="legend-detail flex basis-full flex-wrap items-center gap-x-md gap-y-xs" hidden={collapsed}>
        <span className="legend-note">{LEGEND_NOTE[view]}</span>
        <span className="keys ml-auto">
          <Key>↑</Key>
          <Key>↓</Key> agents · <Key>n</Key> blocked or failed · <Key>[</Key>
          <Key>]</Key> runs · <Key>Esc</Key> root
        </span>
      </div>
    </div>
  );
}
