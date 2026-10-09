import { useBoxStyle } from "@/hooks/useBoxStyle";
import type { FoldPlacement } from "./placement";

type TreeFoldProps = {
  fold: FoldPlacement;
  onExpand: () => void;
};

export function TreeFold({ fold, onExpand }: TreeFoldProps) {
  const buttonRef = useBoxStyle<HTMLButtonElement>({ left: fold.left, top: fold.top, width: fold.width });
  const noun = fold.count === 1 ? "agent" : "agents";
  return (
    <button
      className="node fold"
      ref={buttonRef}
      aria-label={`${fold.count} earlier ${noun} from previous prompts. Show them.`}
      onClick={onExpand}
    >
      <span className="pod fold-pod">{fold.count}</span>
      <span className="ntext">
        <span className="nname">Earlier {noun}</span>
        <span className="nmeta">from previous prompts</span>
      </span>
    </button>
  );
}
