import type { ReactNode } from "react";

const ROLE_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function RoleSymbol({ id, children }: { id: string; children: ReactNode }) {
  return (
    <symbol id={id} viewBox="0 0 24 24">
      <g {...ROLE_STROKE}>{children}</g>
    </symbol>
  );
}

export function SvgSprite() {
  return (
    <svg className="sprite" width="0" height="0" aria-hidden="true">
      <defs>
        <symbol id="g-running" viewBox="-10 -10 20 20">
          <path d="M0 5.5 L0 9" stroke="var(--leaf-ink)" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M0 5.5 C-5.5 2 -5.5 -4 0 -9 C5.5 -4 5.5 2 0 5.5Z" fill="var(--leaf)" stroke="var(--leaf-ink)" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M0 4 L0 -5" stroke="var(--leaf-ink)" strokeWidth="1" strokeLinecap="round" opacity=".5" />
        </symbol>
        <symbol id="g-waiting" viewBox="-10 -10 20 20">
          <path d="M0 5 L0 9" stroke="var(--leaf-ink)" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M0 -9 C4 -5 4.5 0 0 5 C-4.5 0 -4 -5 0 -9Z" fill="var(--leaf-soft)" fillOpacity=".5" stroke="var(--leaf-ink)" strokeWidth="1.4" strokeLinejoin="round" />
        </symbol>
        <symbol id="g-blocked" viewBox="-10 -10 20 20">
          <path d="M0 5 L0 9" stroke="var(--pollen-ink)" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M0 -9 C4.4 -5 5 0 0 5 C-5 0 -4.4 -5 0 -9Z" fill="var(--pollen)" stroke="var(--pollen-ink)" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M-3.3 -3.4 L3.3 2 M3.3 -3.4 L-3.3 2" stroke="var(--pollen-ink)" strokeWidth="1.5" strokeLinecap="round" />
        </symbol>
        <symbol id="g-failed" viewBox="-10 -10 20 20">
          <path d="M-2.5 -9.5 L0 -6" stroke="var(--rose-ink)" strokeWidth="1.4" strokeLinecap="round" />
          <g transform="rotate(30 0 -6)">
            <path d="M0 -6 C-4.8 -3 -5 3 -2 8.5 L0 6 L2 8.5 C5 3 4.8 -3 0 -6Z" fill="var(--rose)" stroke="var(--rose-ink)" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M0 -4.5 L0 4" stroke="var(--rose-ink)" strokeWidth="1" strokeLinecap="round" opacity=".5" />
          </g>
        </symbol>
        <symbol id="g-complete" viewBox="-10 -10 20 20">
          <g transform="scale(.84)" fill="var(--bloom)" stroke="var(--bloom-ink)" strokeWidth="1.2">
            <ellipse cx="0" cy="-4.4" rx="3.2" ry="4.6" />
            <ellipse cx="0" cy="-4.4" rx="3.2" ry="4.6" transform="rotate(72)" />
            <ellipse cx="0" cy="-4.4" rx="3.2" ry="4.6" transform="rotate(144)" />
            <ellipse cx="0" cy="-4.4" rx="3.2" ry="4.6" transform="rotate(216)" />
            <ellipse cx="0" cy="-4.4" rx="3.2" ry="4.6" transform="rotate(288)" />
          </g>
          <circle r="2.3" fill="var(--pollen)" stroke="var(--pollen-ink)" strokeWidth="0.8" />
        </symbol>
        <symbol id="g-sprout" viewBox="-10 -10 20 20">
          <path d="M0 -10 C0 -4 0 0 1 3 C2 6 4 7 5 5" fill="none" stroke="var(--stem)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M1 0 C4 -1 6 -4 5 -6 C2 -6 0 -3 1 0Z" fill="var(--leaf)" />
        </symbol>

        <RoleSymbol id="r-orchestrator">
          <circle cx="12" cy="5" r="2.2" />
          <circle cx="5" cy="19" r="2.2" />
          <circle cx="12" cy="19" r="2.2" />
          <circle cx="19" cy="19" r="2.2" />
          <path d="M12 7.2V16.8M12 10.5C12 13.5 5 13 5 16.8M12 10.5C12 13.5 19 13 19 16.8" />
        </RoleSymbol>
        <RoleSymbol id="r-researcher">
          <path d="M12 6.5C10 5 7 4.6 4 5v13c3-.4 6 0 8 1.5 2-1.5 5-1.9 8-1.5V5c-3-.4-6 0-8 1.5ZM12 6.5v13" />
        </RoleSymbol>
        <RoleSymbol id="r-explorer">
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="M15 15L20 20" />
        </RoleSymbol>
        <RoleSymbol id="r-planner">
          <rect x="5" y="4.5" width="14" height="16.5" rx="2.5" />
          <path d="M9.5 3h5v3h-5z" />
          <path d="M8.5 11l1.3 1.3 2.2-2.3M8.5 16l1.3 1.3 2.2-2.3M14 11.5h2M14 16.5h2" />
        </RoleSymbol>
        <RoleSymbol id="r-implementer">
          <path d="M8.5 7L3.5 12L8.5 17M15.5 7L20.5 12L15.5 17M13.5 5L10.5 19" />
        </RoleSymbol>
        <RoleSymbol id="r-reviewer">
          <path d="M12 3L19.5 6V11.5C19.5 16 16.3 19.4 12 21C7.7 19.4 4.5 16 4.5 11.5V6Z" />
          <path d="M8.8 12L11 14.2L15.4 9.8" />
        </RoleSymbol>
        <RoleSymbol id="r-docs">
          <path d="M6.5 3.5H14L18.5 8V20.5H6.5Z" />
          <path d="M14 3.5V8H18.5M9.5 12.5H15.5M9.5 16H13.5" />
        </RoleSymbol>
        <RoleSymbol id="r-testwriter">
          <path d="M9 3.5H15M10.5 3.5V9.5L5.2 18.7C4.7 19.7 5.4 20.8 6.5 20.8H17.5C18.6 20.8 19.3 19.7 18.8 18.7L13.5 9.5V3.5" />
          <path d="M7.6 15H16.4" />
        </RoleSymbol>
        <RoleSymbol id="r-typecheck">
          <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
          <path d="M8 8.5H16M12 8.5V16.5" />
        </RoleSymbol>
        <RoleSymbol id="r-fixer">
          <path d="M14.7 4.2a4.3 4.3 0 0 0-4.9 5.7L4.4 15.3a2.1 2.1 0 0 0 3 3l5.4-5.4a4.3 4.3 0 0 0 5.7-4.9l-2.6 2.6-2.6-.5-.5-2.6z" />
        </RoleSymbol>
        <RoleSymbol id="r-testrunner">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M10 8.6L15.4 12L10 15.4Z" />
        </RoleSymbol>
        <RoleSymbol id="r-agent">
          <path d="M12 21V11M12 13C12 9 8.5 6.5 5 7C5 10.5 8 13 12 13ZM12 11C12 7.5 15 5 19 5.5C19 9 16 11 12 11Z" />
        </RoleSymbol>
      </defs>
    </svg>
  );
}
