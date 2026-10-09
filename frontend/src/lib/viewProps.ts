import type { ModelSession } from "@/model";

export type SelectOptions = { focusPane?: boolean; reveal?: boolean; focusTarget?: boolean };

export type ViewProps = {
  session: ModelSession;
  selectedId: number | null;
  now: number;
  narrow: boolean;
  onSelect: (id: number, options?: SelectOptions) => void;
};

export type PaneProps = ViewProps & { onClose: () => void };
