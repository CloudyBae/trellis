import { useState } from "react";
import { StateGlyph } from "@/components/agent/StateGlyph";
import { cn } from "@/components/ui/cn";
import { callsText, leadText, statusText } from "@/lib/runStatus";
import type { RunStatus as RunStatusValue, RunStatusKind } from "@/lib/runStatus";

const TONE: Record<RunStatusKind, string> = {
  "needs-you": "bg-st-blocked text-pollen-ink",
  "run-failed": "bg-st-failed text-rose-ink",
  "agent-failed": "bg-st-failed text-rose-ink",
  done: "bg-st-complete text-bloom-ink",
  running: "bg-ground-2 text-ink-2",
  waiting: "bg-ground-2 text-ink-3",
};

const CHIP =
  "run-status inline-flex flex-none items-center gap-xs rounded-round py-3xs pr-sm pl-xs text-state font-medium [&_svg]:size-icon-s";

type Seen = { sessionId: string; kind: RunStatusKind; changed: boolean };

function StatusLabel({ status }: { status: RunStatusValue }) {
  const calls = callsText(status);
  return (
    <span className="min-w-zero truncate">
      {leadText(status)}
      {calls === "" ? null : <span className="text-rose-ink"> · {calls}</span>}
    </span>
  );
}

type Props = {
  sessionId: string;
  status: RunStatusValue;
  stale: boolean;
  onShow: (id: number) => void;
};

export function RunStatus({ sessionId, status, stale, onShow }: Props) {
  const [seen, setSeen] = useState<Seen>({ sessionId, kind: status.kind, changed: false });
  let current = seen;
  if (seen.sessionId !== sessionId || seen.kind !== status.kind) {
    current = { sessionId, kind: status.kind, changed: seen.sessionId === sessionId };
    setSeen(current);
  }

  if (stale) {
    return (
      <span className={cn(CHIP, "stale border border-dashed border-rule pr-sm text-ink-2")} role="status">
        Trellis server stopped · showing the last state
      </span>
    );
  }

  const text = statusText(status);
  const { target } = status;
  const key = `${sessionId}:${status.kind}`;
  const settle = current.changed ? "settle" : "";
  if (target === null) {
    return (
      <span key={key} className={cn(CHIP, TONE[status.kind], settle)} data-status={status.kind}>
        <StateGlyph state={status.glyph} />
        <StatusLabel status={status} />
      </span>
    );
  }
  return (
    <button
      key={key}
      type="button"
      className={cn(CHIP, TONE[status.kind], settle, "cursor-pointer border-0")}
      data-status={status.kind}
      aria-label={`${text}. Show`}
      onClick={() => onShow(target)}
    >
      <StateGlyph state={status.glyph} />
      <StatusLabel status={status} />
      <span className="font-normal underline decoration-current underline-offset-3">Show</span>
    </button>
  );
}
