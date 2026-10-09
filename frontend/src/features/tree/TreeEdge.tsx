import { MAX_TOOL_LEAVES } from "@/model";
import type { EdgePlacement } from "./placement";
import { ToolLeaf } from "@/components/agent/ToolLeaf";

type TreeEdgeProps = {
  edge: EdgePlacement;
  shownPath: string;
  done: boolean;
  growing: boolean;
  onGrown: (id: number) => void;
};

export function TreeEdge({ edge, shownPath, done, growing, onGrown }: TreeEdgeProps) {
  const className = ["a", edge.lit ? "lit" : "", done ? "done" : ""].filter(Boolean).join(" ");
  return (
    <g className={className}>
      <path
        className={growing ? "stem grow" : "stem"}
        pathLength={1}
        d={shownPath}
        onAnimationEnd={(event) => {
          if (event.animationName === "grow") {
            onGrown(edge.id);
          }
        }}
      />
      {edge.leaves.map((leaf, index) => (
        <ToolLeaf
          key={index}
          state={leaf.state}
          transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.rotation})`}
        />
      ))}
      {edge.toolTotal > MAX_TOOL_LEAVES && edge.leaves.length > 0 ? (
        <text
          className="fl-more"
          x={edge.leaves[0]!.x + 14}
          y={(edge.leaves[0]!.y + edge.leaves[edge.leaves.length - 1]!.y) / 2}
          dominantBaseline="middle"
        >
          {`×${edge.toolTotal}`}
        </text>
      ) : null}
    </g>
  );
}
