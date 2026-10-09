import { Fragment, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { ancestry } from "@/model";
import type { ModelSession, PreparedAgent } from "@/model";
import type { SelectOptions } from "@/lib/viewProps";
import { AgentLabel } from "@/components/agent/AgentLabel";
import { ROOT_ID } from "./placement";
import "./crumbs.css";

const SCROLLED_THRESHOLD = 2;

type CrumbsProps = {
  session: ModelSession;
  selectedId: number | null;
  flowRef: RefObject<HTMLElement | null>;
  onSelect: (id: number, options?: SelectOptions) => void;
};

function chainFor(session: ModelSession, selectedId: number | null): PreparedAgent[] {
  const start = (selectedId === null ? undefined : session.by[selectedId]) ?? session.by[ROOT_ID];
  if (start === undefined) {
    return [];
  }
  return [...ancestry(session.by, start.id)].reverse().flatMap((id) => {
    const agent = session.by[id];
    return agent === undefined ? [] : [agent];
  });
}

function useScrolledHairline(navRef: RefObject<HTMLElement | null>, flowRef: RefObject<HTMLElement | null>): boolean {
  const [scrolled, setScrolled] = useState(false);

  useLayoutEffect(() => {
    const garden = navRef.current?.closest(".garden") ?? null;
    const update = (): void => {
      setScrolled(Math.max(garden?.scrollTop ?? 0, flowRef.current?.scrollTop ?? 0) > SCROLLED_THRESHOLD);
    };
    update();
    garden?.addEventListener("scroll", update, { passive: true, capture: true });
    return () => garden?.removeEventListener("scroll", update, { capture: true });
  }, [navRef, flowRef]);

  return scrolled;
}

export function Crumbs({ session, selectedId, flowRef, onSelect }: CrumbsProps) {
  const navRef = useRef<HTMLElement>(null);
  const scrolled = useScrolledHairline(navRef, flowRef);
  const chain = chainFor(session, selectedId);
  return (
    <nav
      className={scrolled ? "crumbs scrolled" : "crumbs"}
      id="crumbs"
      aria-label="Delegation path"
      ref={navRef}
    >
      {chain.map((agent, index) =>
        index === chain.length - 1 ? (
          <span className="crumb now" aria-current="location" key={agent.id}>
            <AgentLabel agent={agent} />
          </span>
        ) : (
          <Fragment key={agent.id}>
            <button className="crumb" data-crumb={agent.id} onClick={() => onSelect(agent.id, { reveal: true })}>
              <AgentLabel agent={agent} />
            </button>
            <svg className="crumb-sep" viewBox="0 0 8 8" aria-hidden="true">
              <path
                d="M2.4 1L5.6 4L2.4 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Fragment>
        ),
      )}
    </nav>
  );
}
