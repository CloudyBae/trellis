import { useLayoutEffect, useState } from "react";
import type { ReactElement, RefObject } from "react";
import { useBoxStyle } from "@/hooks/useBoxStyle";
import { DEFAULT_LABEL_RESERVE, DEFAULT_ROOT_LABEL_RESERVE, POD_SIZE, columnWidthFor } from "./placement";

const LONG_TASK = "Reconcile every pending ledger entry against the archived statements before the quarterly close";
const LONG_ACTIVITY =
  "Reading the archived statements and comparing each pending ledger entry with the matching bank record before filing a summary. " +
  "Then checking every adjustment against the approved budget and noting each difference that still needs a reviewer to sign off.";
const PROBE_STATE = "waiting";
const PROBE_ROOT_NAME = "Orchestrator";
const PROBE_TAG = "Security reviewer 12";

type LabelReserve = {
  labelReserve: number;
  rootLabelReserve: number;
  probe: ReactElement;
};

function heightOf(ref: RefObject<HTMLElement | null>): number {
  return Math.ceil(ref.current?.getBoundingClientRect().height ?? 0);
}

export function useLabelReserve(narrow: boolean, rootWidth: number): LabelReserve {
  const [reserve, setReserve] = useState({ label: DEFAULT_LABEL_RESERVE, root: DEFAULT_ROOT_LABEL_RESERVE });
  const nodeRef = useBoxStyle<HTMLButtonElement>({ width: columnWidthFor(narrow) });
  const rootRef = useBoxStyle<HTMLButtonElement>({ width: rootWidth });

  useLayoutEffect(() => {
    let active = true;
    const measure = (): void => {
      const nodeHeight = heightOf(nodeRef);
      const rootHeight = heightOf(rootRef);
      if (nodeHeight <= POD_SIZE || rootHeight <= 0) {
        return;
      }
      setReserve((previous) => {
        const label = nodeHeight - POD_SIZE;
        return previous.label === label && previous.root === rootHeight ? previous : { label, root: rootHeight };
      });
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    [nodeRef.current, rootRef.current].forEach((element) => {
      if (element !== null) {
        observer?.observe(element);
      }
    });
    const fonts: FontFaceSet | undefined = document.fonts;
    void fonts?.ready.then(() => {
      if (active) {
        measure();
      }
    });
    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [narrow, rootWidth, nodeRef, rootRef]);

  const probe = (
    <div className="nprobe" aria-hidden="true">
      <button type="button" tabIndex={-1} className="node s-waiting" ref={nodeRef}>
        <span className="pod" />
        <span className="ntext">
          <span className="nname task">{LONG_TASK}</span>
          <span className="ntag">{PROBE_TAG}</span>
          <span className="nmeta">
            <span className="state s-waiting">{PROBE_STATE}</span>
          </span>
          <span className="nact">{LONG_ACTIVITY}</span>
        </span>
      </button>
      <button type="button" tabIndex={-1} className="node s-waiting root" ref={rootRef}>
        <span className="pod" />
        <span className="ntext">
          <span className="nname">{PROBE_ROOT_NAME}</span>
          <span className="nmeta">
            <span className="state s-waiting">{PROBE_STATE}</span>
          </span>
          <span className="nact">{LONG_ACTIVITY}</span>
        </span>
      </button>
    </div>
  );

  return { labelReserve: reserve.label, rootLabelReserve: reserve.root, probe };
}
