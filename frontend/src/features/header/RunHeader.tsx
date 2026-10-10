import { useEffect, useLayoutEffect, useRef } from "react";
import type { FocusEvent } from "react";
import type { ModelSession } from "@/model";
import { Button, buttonVariants } from "@/components/ui/Button";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/DropdownMenu";
import { cn } from "@/components/ui/cn";
import type { Clock } from "@/lib/clock";
import { clockAt, duration } from "@/lib/format";
import { RunMenu } from "./RunMenu";
import { RunStatus } from "./RunStatus";
import { StateGlyph } from "@/components/agent/StateGlyph";
import { runStatus } from "@/lib/runStatus";
import { attentionAlert, isLive } from "@/lib/sessionDisplay";

type Props = {
  session: ModelSession;
  sessions: ModelSession[];
  clock: Clock;
  now: number;
  served: boolean;
  emptyMode: boolean;
  linkDown: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onOpenSession: (id: string) => void;
  onReplay: () => void;
  onCloseDemo: () => void;
  onShowAgent: (id: number) => void;
};

function RunMeta({ session, clock, now }: Pick<Props, "session" | "clock" | "now">) {
  const { run } = session;
  const where = [run.repo, run.source].filter(Boolean).join(" · ");
  const started = clockAt(run.clock0, 0);
  return (
    <div className="run-meta truncate text-state text-ink-3">
      {isLive(session, clock) ? (
        <>
          {where} · started {started} · <span className="tnum">{duration(now)}</span>
        </>
      ) : (
        `${where} · ${started} to ${clockAt(run.clock0, now)} · took ${duration(now)}`
      )}
    </div>
  );
}

export function RunHeader(props: Props) {
  const { session, sessions, clock, served, emptyMode, menuOpen, onOpenSession, onReplay, onCloseDemo, onShowAgent } = props;
  const setMenuOpen = props.onMenuOpenChange;
  const focusedRowId = useRef<string | null>(null);
  const runElement = useRef<HTMLDivElement>(null);
  const menuElement = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      focusedRowId.current = null;
    }
  }, [menuOpen]);

  useLayoutEffect(() => {
    const menu = menuElement.current;
    if (!menuOpen || menu === null || focusedRowId.current === null) {
      return;
    }
    if (menu.contains(document.activeElement) || runElement.current?.contains(document.activeElement)) {
      return;
    }
    menu.querySelector<HTMLElement>(`[data-sid="${focusedRowId.current}"]`)?.focus();
  });

  function chooseSession(id: string): void {
    if (id !== session.id) {
      onOpenSession(id);
    }
  }

  function handleFocus(event: FocusEvent<HTMLDivElement>): void {
    focusedRowId.current = event.target instanceof HTMLElement ? (event.target.dataset.sid ?? null) : null;
  }

  const alert = attentionAlert(sessions, session, clock);
  const status = runStatus(session, clock);
  const alertGlyph = alert.kind === "failed" ? "failed" : "blocked";
  const others = alert.count === 1 ? "other" : "others";
  const alertWord = alert.kind === "failed" ? `${others} failed` : `${others} ${alert.count === 1 ? "needs" : "need"} you`;
  const replayDemo = !session.real && session.replay;

  return (
    <div className="run flex min-w-zero flex-col leading-snug" id="run" ref={runElement} onFocus={handleFocus}>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <div className="run-line flex min-w-zero flex-wrap items-center gap-x-sm gap-y-2xs">
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "runswitch group -my-3xs -ml-s min-w-zero gap-xs rounded-md px-s py-3xs aria-expanded:bg-wash",
            )}
            id="runSwitch"
            aria-controls={menuOpen ? "sessMenu" : undefined}
            aria-label={`${session.run.name}. Switch session${alert.why ? `. ${alert.why}` : ""}`}
            title={alert.why || "Switch session"}
          >
            <span className="run-name min-w-zero truncate text-run font-bold">{session.run.name}</span>
            <svg
              className="chev-down size-icon-s flex-none text-ink-3 transition-transform ease-brand group-aria-expanded:rotate-180"
              viewBox="0 0 14 14"
              aria-hidden="true"
            >
              <path d="M3 5.2L7 9L11 5.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span
              className={cn(
                "alert-pill inline-flex flex-none items-center gap-2xs rounded-round py-3xs pr-xs pl-2xs text-note font-medium [&_svg]:size-icon-s",
                alert.kind === "failed" ? "bg-st-failed text-rose-ink" : "bg-st-blocked text-pollen-ink",
              )}
              hidden={alert.kind === "none"}
            >
              <StateGlyph state={alertGlyph} />
              {alert.count}
              <span className="word">{alertWord}</span>
            </span>
          </DropdownMenuTrigger>
          <RunStatus
            sessionId={session.id}
            status={status}
            stale={props.linkDown && session.real}
            onShow={onShowAgent}
          />
          <span className="demo flex-none text-note whitespace-nowrap text-pollen-ink" hidden={session.real}>
            synthetic demo
          </span>
          <Button variant="link" className="replay flex-none text-label" hidden={!replayDemo} onClick={onReplay}>
            Replay
          </Button>
          <Button
            variant="link"
            className="replay flex-none text-label"
            hidden={!((emptyMode || served) && replayDemo)}
            onClick={() => {
              setMenuOpen(false);
              onCloseDemo();
            }}
          >
            Close demo
          </Button>
        </div>
        <RunMeta session={session} clock={clock} now={props.now} />
        <RunMenu
          sessions={sessions}
          currentId={session.id}
          clock={clock}
          served={served}
          menuRef={menuElement}
          onChoose={chooseSession}
        />
      </DropdownMenu>
    </div>
  );
}
