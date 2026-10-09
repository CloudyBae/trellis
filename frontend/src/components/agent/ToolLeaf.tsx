import type { LeafState } from "@/model";
import "./toolLeaf.css";

const TOOL_LEAF_PATH = "M0 0 C3 -3.4 8 -3.4 11 0 C8 3.4 3 3.4 0 0Z";
const FAILED_LEAF_PATH = "M0 0 C3 -3.4 8 -3.4 11.4 -1.7 L8.4 0 L11.4 1.7 C8 3.4 3 3.4 0 0Z";

export const TOOL_LEAF_LENGTH = 11;

export function ToolLeaf({ state, transform }: { state: LeafState; transform?: string }) {
  return (
    <path
      className={state === "ok" ? "tool-leaf" : `tool-leaf ${state}`}
      d={state === "failed" ? FAILED_LEAF_PATH : TOOL_LEAF_PATH}
      transform={transform}
    />
  );
}
