import { useEffect, useReducer, useState } from "react";
import type { StreamSourceFactory } from "@/api";
import { BrandMark } from "@/features/header/BrandMark";
import { Counts } from "@/features/header/Counts";
import { EmptyState } from "./app/EmptyState";
import { Legend } from "./app/Legend";
import { LiveRegion } from "./app/LiveRegion";
import { RunHeader } from "@/features/header/RunHeader";
import { SvgSprite } from "./app/SvgSprite";
import { ThemeToggle } from "@/features/header/ThemeToggle";
import { ViewSwitch } from "@/features/header/ViewSwitch";
import { createInitialState, reduceApp, wantsEmpty } from "./app/appState";
import type { AppIntent } from "./app/appState";
import { findAgentTarget, firstAgentTarget, focusAgentTarget, revealAgentTarget } from "./app/agentTargets";
import type { ShellEnvironment } from "@/lib/clock";
import { alive, stateOf } from "@/model";
import type { AgentStateName } from "@/model";
import { NARROW_QUERY, useMediaQuery } from "@/hooks/mediaQuery";
import { orderSessions, timeOf } from "@/lib/sessionDisplay";
import type { SelectOptions } from "@/lib/viewProps";
import { useClock } from "@/hooks/useClock";
import { useDeferredAction } from "@/hooks/useDeferredAction";
import { useKeyboardShortcuts } from "./app/useKeyboardShortcuts";
import { useLatest } from "@/hooks/useLatest";
import { useStream } from "./app/useStream";
import { useTheme } from "./app/useTheme";
import { useView } from "./app/useView";
import { AgentPane } from "@/features/pane/AgentPane";
import { TimelineView } from "@/features/timeline/TimelineView";
import { TreeView } from "@/features/tree/TreeView";
import "@fontsource/alegreya-sans/latin-400.css";
import "@fontsource/alegreya-sans/latin-500.css";
import "@fontsource/alegreya-sans/latin-700.css";
import "@fontsource/quicksand/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "./styles/tokens.css";
import "./styles/tailwind.css";
import "./styles/base.css";
import "./styles/shell.css";

export function App({ createSource }: { createSource?: StreamSourceFactory }) {
  const clock = useClock();
  const narrow = useMediaQuery(NARROW_QUERY);
  const environment: ShellEnvironment = { ...clock, narrow };
  const latestEnvironment = useLatest(environment);
  const [state, dispatch] = useReducer(reduceApp, undefined, () =>
    createInitialState(window.location, environment),
  );
  const latestState = useLatest(state);
  const { view, chooseView } = useView();
  const theme = useTheme();
  const defer = useDeferredAction();
  const [streamEnabled] = useState(state.served);
  const [menuOpen, setMenuOpen] = useState(false);

  const current = state.store.current;
  const now = current === null ? 0 : timeOf(current, clock);

  function send(intent: AppIntent): void {
    dispatch({ env: { ...latestEnvironment.current, clockMs: Date.now() }, intent });
  }

  useStream(streamEnabled, send, createSource);

  useEffect(() => {
    if (state.store.current === null) {
      setMenuOpen(false);
    }
  }, [state.store.current]);

  useEffect(() => {
    function onHashChange(): void {
      const { served, emptyMode } = latestState.current;
      if (served) {
        return;
      }
      if (wantsEmpty(window.location) && !emptyMode) {
        dispatch({ env: { ...latestEnvironment.current, clockMs: Date.now() }, intent: { type: "previewEmpty" } });
      } else if (!wantsEmpty(window.location) && emptyMode) {
        window.location.reload();
      }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [latestState, latestEnvironment]);

  function selectAgent(id: number, options: SelectOptions = {}): void {
    send({ type: "select", id });
    defer(() => {
      if (options.focusPane && latestEnvironment.current.narrow) {
        document.querySelector<HTMLElement>("#pane .back")?.focus();
      }
      if (options.reveal) {
        revealAgentTarget(view, id);
      }
      if (options.focusTarget) {
        focusAgentTarget(view, id);
      }
    });
  }

  function closePane(): void {
    const id = state.selectedId;
    send({ type: "deselect" });
    if (id !== null) {
      defer(() => findAgentTarget(view, id)?.focus());
    }
  }

  function stepSession(direction: 1 | -1): void {
    const { all } = orderSessions(state.store.sessions, clock);
    const index = current === null ? -1 : all.findIndex((session) => session.id === current.id);
    const target = all[(index + direction + all.length) % all.length];
    if (target !== undefined) {
      send({ type: "open", id: target.id, announce: true });
    }
  }

  function cycleState(name: AgentStateName): void {
    if (current === null) {
      return;
    }
    const list = current.agents.filter((agent) => alive(agent, now) && stateOf(agent, now).s === name);
    const index = list.findIndex((agent) => agent.id === state.selectedId);
    const next = list[(index + 1) % list.length];
    if (next !== undefined) {
      selectAgent(next.id, { focusPane: true, reveal: true });
    }
  }

  function startDemo(): void {
    send({ type: "startDemo" });
    defer(() => document.getElementById("run")?.scrollIntoView?.({ block: "nearest" }));
  }

  function closeDemo(): void {
    send({ type: "closeDemo" });
    defer(() => (document.getElementById("demoBtn") ?? document.getElementById("runSwitch"))?.focus());
  }

  function skipToGraph(event: { preventDefault: () => void }): void {
    event.preventDefault();
    (firstAgentTarget(view) ?? document.getElementById("garden"))?.focus();
  }

  useKeyboardShortcuts({
    session: current,
    selectedId: state.selectedId,
    now,
    narrow,
    view,
    menuOpen,
    select: selectAgent,
    closePane,
    stepSession,
    announce: (text) => send({ type: "announce", text }),
  });

  const viewProps =
    current === null
      ? null
      : { session: current, selectedId: state.selectedId, now, narrow, onSelect: selectAgent };

  return (
    <>
      <SvgSprite />
      <div className={current === null ? "app is-empty" : "app"}>
        {current !== null && (
          <a className="skip" href="#garden" id="skip" onClick={skipToGraph}>
            Skip to the graph
          </a>
        )}
        <header className="top">
          <BrandMark />
          {current !== null && (
            <RunHeader
              session={current}
              sessions={state.store.sessions}
              clock={clock}
              now={now}
              served={state.served}
              emptyMode={state.emptyMode}
              linkDown={state.linkDown}
              menuOpen={menuOpen}
              onMenuOpenChange={setMenuOpen}
              onOpenSession={(id) => send({ type: "open", id, announce: true })}
              onReplay={() => send({ type: "open", id: current.id, announce: false })}
              onCloseDemo={closeDemo}
            />
          )}
          {current !== null && <Counts session={current} now={now} onCycle={cycleState} />}
          <div className="tools">
            {current !== null && <ViewSwitch view={view} onChoose={chooseView} />}
            <ThemeToggle dark={theme.dark} onToggle={theme.toggle} />
          </div>
        </header>
        {current === null && <EmptyState onStartDemo={startDemo} />}
        {viewProps !== null && (
          <>
            <main className="garden" id="garden" aria-label="Delegation graph" tabIndex={-1} data-view={view}>
              <TimelineView {...viewProps} view={view} />
              <TreeView {...viewProps} />
              <Legend view={view} />
            </main>
            <AgentPane {...viewProps} onClose={closePane} />
          </>
        )}
        <LiveRegion announcement={state.announcement} />
      </div>
    </>
  );
}
