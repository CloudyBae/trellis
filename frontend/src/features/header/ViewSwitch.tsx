import type { View } from "@/lib/view";
import { Button } from "@/components/ui/Button";

const OPTIONS: { view: View; label: string }[] = [
  { view: "tree", label: "Tree" },
  { view: "timeline", label: "Timeline" },
];

export function ViewSwitch({ view, onChoose }: { view: View; onChoose: (next: View) => void }) {
  return (
    <div className="views flex rounded-lg bg-ground-2 p-3xs" role="group" aria-label="View">
      {OPTIONS.map((option) => (
        <Button
          key={option.view}
          variant="segment"
          className="rounded-sm px-m py-xs text-control"
          data-view={option.view}
          aria-pressed={option.view === view}
          onClick={() => onChoose(option.view)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
