import { Button } from "@/components/ui/Button";

function FirstRunBody() {
  return (
    <>
      Start an agent in Claude Code, Codex or GitHub Copilot and its run will appear here as a tree you can
      watch and open. Trellis shows runs from the last 24 hours; start it with{" "}
      <code className="font-mono">--since</code> to look further back.
    </>
  );
}

function UnreachableBody() {
  return (
    <>
      This page loaded, but the server that streams your runs isn't answering. Start Trellis again in your
      terminal, then reload this page.
    </>
  );
}

export function EmptyState({ onStartDemo, unreachable = false }: { onStartDemo: () => void; unreachable?: boolean }) {
  return (
    <section className="empty col-span-full grid place-items-center overflow-auto px-ml pt-ml pb-gap" id="firstRun" aria-labelledby="emptyTitle">
      <div className="empty-in flex max-w-empty flex-col items-center text-center">
        <svg className="empty-art" viewBox="0 0 280 200" aria-hidden="true">
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <g className="ea-stem">
              <path d="M52 57V90Q52 100 62 100H232" />
              <path d="M104 100V124M168 100V124M232 100V124" />
            </g>
            <g className="ea-pod">
              <circle cx="52" cy="37" r="20" />
              <circle cx="104" cy="146" r="18" />
              <circle cx="168" cy="146" r="18" />
              <circle cx="232" cy="146" r="18" />
            </g>
          </g>
          <g className="ea-leaf">
            <ellipse cx="99" cy="112" rx="5" ry="2.1" transform="rotate(-38 99 112)" />
            <ellipse cx="163" cy="112" rx="5" ry="2.1" transform="rotate(-38 163 112)" />
            <ellipse cx="237" cy="112" rx="5" ry="2.1" transform="rotate(38 237 112)" />
          </g>
          <g className="ea-bar">
            <rect x="84" y="26" width="86" height="6" rx="3" />
            <rect x="84" y="40" width="116" height="6" rx="3" />
            <rect x="82" y="174" width="44" height="6" rx="3" />
            <rect x="146" y="174" width="44" height="6" rx="3" />
            <rect x="210" y="174" width="44" height="6" rx="3" />
          </g>
        </svg>
        <h1 id="emptyTitle" className="m-zero mb-m text-display leading-tight font-bold tracking-tight text-balance">
          {unreachable ? "Can't reach the Trellis server" : "Nothing growing yet"}
        </h1>
        <p className="m-zero max-w-copy text-title leading-body text-ink-2 text-pretty">
          {unreachable ? <UnreachableBody /> : <FirstRunBody />}
        </p>
        <Button variant="solid" className="btn mt-lg min-h-cta rounded-lg px-ml text-body" id="demoBtn" onClick={onStartDemo}>
          Watch a demo run
        </Button>
        <p className="empty-note m-zero mt-md text-meta text-ink-3">The demo is made-up data, just so you can see how a run grows.</p>
      </div>
    </section>
  );
}
