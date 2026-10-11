import "./evals.css";

function Key({ children }: { children: string }) {
  return <kbd className="rounded-key bg-ground-2 px-xs font-mono text-xs font-medium text-ink-2">{children}</kbd>;
}

export function KeyLine() {
  return (
    <div className="eval-keys" aria-label="Keyboard shortcuts">
      <Key>↑</Key>
      <Key>↓</Key> entries · <Key>Enter</Key> open · <Key>1 to 9</Key> trial · <Key>n</Key> next regression · <Key>Esc</Key> close
    </div>
  );
}
