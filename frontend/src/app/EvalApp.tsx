import { useMemo, useState } from "react";
import type { EvalExperiment } from "@/model";
import { BrandMark } from "@/features/header/BrandMark";
import { ThemeToggle } from "@/features/header/ThemeToggle";
import { ExperimentLine } from "@/features/evals/ExperimentLine";
import { KeyLine } from "@/features/evals/KeyLine";
import { Ledger } from "@/features/evals/Ledger";
import { MeasuresList } from "@/features/evals/MeasuresList";
import { ValidityPanel } from "@/features/evals/ValidityPanel";
import { focusTrigger, revealEntry } from "@/features/evals/navigation";
import { useEvalKeys } from "@/features/evals/useEvalKeys";
import { changeGroups, defaultTrial, nextRegression, regressions } from "@/lib/evals";
import type { EvalFocus } from "@/lib/evals";
import { NARROW_QUERY, matchesQuery } from "@/hooks/mediaQuery";
import { useDeferredAction } from "@/hooks/useDeferredAction";
import { useTheme } from "./useTheme";
import "@fontsource/alegreya-sans/latin-400.css";
import "@fontsource/alegreya-sans/latin-500.css";
import "@fontsource/alegreya-sans/latin-700.css";
import "@fontsource/quicksand/latin-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@/styles/tokens.css";
import "@/styles/tailwind.css";
import "@/styles/base.css";
import "@/styles/shell.css";

function initialFocus(experiment: EvalExperiment): EvalFocus | null {
  const first = changeGroups(experiment).groups[0]?.cases[0];
  return first === undefined ? null : defaultTrial(first);
}

export function EvalApp({ experiment }: { experiment: EvalExperiment }) {
  const theme = useTheme();
  const defer = useDeferredAction();
  const groups = useMemo(() => changeGroups(experiment), [experiment]);
  const [focus, setFocus] = useState<EvalFocus | null>(() => (matchesQuery(NARROW_QUERY) ? null : initialFocus(experiment)));
  const [expanded, setExpanded] = useState(false);
  const regressionCount = regressions(experiment).length;

  function openCase(caseId: string): void {
    const evalCase = experiment.cases.find((item) => item.id === caseId);
    const next = evalCase === undefined ? null : defaultTrial(evalCase);
    if (next !== null) {
      setFocus(next);
      defer(() => revealEntry(caseId));
    }
  }

  function closeEntry(): void {
    setFocus(null);
  }

  function toggleFold(): void {
    const hidden = expanded && groups.unchanged.some((evalCase) => evalCase.id === focus?.caseId);
    setExpanded(!expanded);
    if (hidden) {
      setFocus(null);
    }
  }

  function jumpToRegression(): void {
    const target = nextRegression(experiment, focus?.caseId ?? null);
    const next = target === null ? null : defaultTrial(target);
    if (next !== null) {
      setFocus(next);
      focusTrigger(next.caseId);
      defer(() => revealEntry(next.caseId));
    }
  }

  useEvalKeys({ experiment, focus, onSelect: setFocus, onClose: closeEntry });

  return (
    <div className="app eval-app">
      <header className="top">
        <BrandMark />
        <ExperimentLine experiment={experiment} regressionCount={regressionCount} onNextRegression={jumpToRegression} />
        <div className="tools">
          <ThemeToggle dark={theme.dark} onToggle={theme.toggle} />
        </div>
      </header>
      <main className="eval-ledger" aria-label="Evaluation experiment" tabIndex={-1}>
        <Ledger
          experiment={experiment}
          groups={groups}
          focus={focus}
          expanded={expanded}
          onToggleFold={toggleFold}
          onOpen={openCase}
          onClose={closeEntry}
          onSelectTrial={setFocus}
        />
      </main>
      <aside className="eval-aside" aria-label="Comparison validity and measures">
        <div className="eval-aside-in">
          <ValidityPanel experiment={experiment} />
          <MeasuresList measures={experiment.measures} />
        </div>
        <KeyLine />
      </aside>
    </div>
  );
}
