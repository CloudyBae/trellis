import { useEffect, useRef } from "react";
import type { AnimationEvent } from "react";
import { MAX_TOOL_LEAVES, layoutMetrics } from "@/model";
import type { AgentStem } from "./stemGeometry";
import type { StemMotion } from "./useStemMotion";
import { TOOL_LEAF_LENGTH, ToolLeaf } from "@/components/agent/ToolLeaf";

type TimelineStemsProps = {
  stems: AgentStem[];
  width: number;
  height: number;
  maxLane: number;
  narrow: boolean;
  hasSelection: boolean;
  lit: ReadonlySet<number>;
  motion: StemMotion;
};

const GLYPH_SIZE = 16;
const SPROUT_SIZE = 14;
const KNOT_RADIUS = 3.2;

function classes(...names: Array<string | false>): string {
  return names.filter(Boolean).join(" ");
}

function useCancelledAnimations(motion: StemMotion) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { finishGrowing, finishPopping } = motion;
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) {
      return;
    }
    const onCancel = (event: Event) => {
      if (!(event.target instanceof SVGElement)) {
        return;
      }
      const { stem, glyph } = event.target.dataset;
      if (stem !== undefined) {
        finishGrowing(stem);
      }
      if (glyph !== undefined) {
        finishPopping(glyph);
      }
    };
    svg.addEventListener("animationcancel", onCancel);
    return () => svg.removeEventListener("animationcancel", onCancel);
  }, [finishGrowing, finishPopping]);
  return svgRef;
}

export function TimelineStems(props: TimelineStemsProps) {
  const metrics = layoutMetrics(props.narrow);
  const { motion } = props;
  const svgRef = useCancelledAnimations(motion);
  const wires = Array.from({ length: props.maxLane + 1 }, (_, lane) => metrics.x0 + lane * metrics.lane);
  const onGrown = (key: string) => (event: AnimationEvent) => {
    if (event.animationName === "timeline-grow") {
      motion.finishGrowing(key);
    }
  };
  const onPopped = (key: string) => (event: AnimationEvent) => {
    if (event.animationName === "timeline-pop") {
      motion.finishPopping(key);
    }
  };

  return (
    <svg
      ref={svgRef}
      className={classes("stems", props.hasSelection && "has-sel")}
      id="stems"
      width={props.width}
      height={props.height}
      viewBox={`0 0 ${props.width} ${props.height}`}
      aria-hidden="true"
    >
      {wires.map((wireX) => (
        <line className="wire" key={wireX} x1={wireX} x2={wireX} y1={0} y2={props.height} />
      ))}
      {props.stems.map((stem) => {
        const returned = stem.returnY !== null;
        const popping = motion.popping.has(stem.glyphKey);
        return (
          <g
            className={classes("a", props.lit.has(stem.id) && "lit", returned && motion.settledIds.has(stem.id) && "done")}
            key={stem.id}
            data-agent-id={stem.id}
          >
            {stem.paths.map((path) => (
              <path
                className={classes("stem", motion.growing.has(path.key) && "grow")}
                key={path.key}
                data-stem={path.key}
                pathLength={1}
                d={path.d}
                onAnimationEnd={onGrown(path.key)}
              />
            ))}
            {stem.leaves.map((leaf, index) => (
              <ToolLeaf
                key={index}
                state={leaf.state}
                transform={`translate(${leaf.cx} ${leaf.cy}) rotate(${leaf.rotation}) scale(0.9) translate(${-TOOL_LEAF_LENGTH / 2} 0)`}
              />
            ))}
            {stem.toolTotal > MAX_TOOL_LEAVES && stem.leaves.length > 0 ? (
              <text className="tl-more" x={stem.x + 14} y={stem.leaves[0]!.cy} dominantBaseline="middle">
                {`×${stem.toolTotal}`}
              </text>
            ) : null}
            {stem.returnY !== null ? (
              <>
                <circle className="knot" cx={stem.x} cy={stem.spawnY} r={KNOT_RADIUS} />
                <g transform={`translate(${stem.x - GLYPH_SIZE / 2} ${stem.returnY - GLYPH_SIZE / 2})`}>
                  <use
                    className={classes(popping && "pop")}
                    href={`#g-${stem.final}`}
                    width={GLYPH_SIZE}
                    height={GLYPH_SIZE}
                    data-glyph={stem.glyphKey}
                    onAnimationEnd={onPopped(stem.glyphKey)}
                  />
                </g>
              </>
            ) : (
              <g transform={`translate(${stem.x - GLYPH_SIZE / 2} ${stem.spawnY - GLYPH_SIZE / 2})`}>
                <use
                  className={classes(stem.state === "running" && "sway", popping && "pop")}
                  href={`#g-${stem.state}`}
                  width={GLYPH_SIZE}
                  height={GLYPH_SIZE}
                  data-glyph={stem.glyphKey}
                  onAnimationEnd={onPopped(stem.glyphKey)}
                />
              </g>
            )}
            {!returned && (
              <g transform={`translate(${stem.x - SPROUT_SIZE / 2} ${stem.tipY - 1})`}>
                <use className="tip" href="#g-sprout" width={SPROUT_SIZE} height={SPROUT_SIZE} />
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
