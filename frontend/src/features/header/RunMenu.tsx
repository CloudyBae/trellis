import type { RefObject } from "react";
import type { ModelSession } from "@/model";
import { DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/DropdownMenu";
import { cn } from "@/components/ui/cn";
import type { Clock } from "@/lib/clock";
import { describeEntry, isToday, orderSessions } from "@/lib/sessionDisplay";
import type { MenuEntry } from "@/lib/sessionDisplay";
import { StateGlyph } from "@/components/agent/StateGlyph";

const MENU_SIDE_OFFSET = 10;
const MENU_ALIGN_OFFSET = -8;
const MENU_COLLISION_PADDING = 12;

type Props = {
  sessions: ModelSession[];
  currentId: string;
  clock: Clock;
  served: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  onChoose: (id: string) => void;
};

const NOTE_TONE = {
  plain: "",
  blocked: "font-medium text-pollen-ink",
  failed: "text-rose-ink",
} as const;

function MenuRow({ entry }: { entry: MenuEntry }) {
  const { session, live, worst, when, note } = entry;
  return (
    <DropdownMenuRadioItem
      value={session.id}
      data-sid={session.id}
      className={cn("sess flex items-start gap-sm [&_svg]:mt-2xs [&_svg]:size-md", live ? "" : "past")}
    >
      <StateGlyph state={worst} />
      <span className="min-w-zero flex-1">
        <span className="flex items-baseline gap-sm">
          <span className={cn("s-name min-w-zero flex-1 truncate text-item leading-snug font-bold", live ? "" : "font-medium text-ink-2")}>
            {session.run.name}
          </span>
          <span className="s-when text-label text-ink-3">
            {when.ticking ? <span className="tnum">{when.text}</span> : when.text}
          </span>
        </span>
        <span className="s-meta block truncate text-label text-ink-3">
          {session.run.repo} · {session.run.source}
        </span>
        <span className={cn("s-note mt-2xs block text-meta leading-snug text-ink-2", NOTE_TONE[note.tone])}>
          {note.text}
        </span>
      </span>
    </DropdownMenuRadioItem>
  );
}

export function RunMenu({ sessions, currentId, clock, served, menuRef, onChoose }: Props) {
  const { active, past } = orderSessions(sessions, clock);
  const rows = (list: ModelSession[]) => (
    <DropdownMenuRadioGroup value={currentId} onValueChange={onChoose}>
      {list.map((session) => (
        <MenuRow key={session.id} entry={describeEntry(session, clock)} />
      ))}
    </DropdownMenuRadioGroup>
  );
  function focusCheckedRow(event: Event): void {
    event.preventDefault();
    const menu = menuRef.current;
    const target = menu?.querySelector<HTMLElement>('[aria-checked="true"]') ?? menu?.querySelector<HTMLElement>(".sess");
    target?.focus();
  }
  return (
    <DropdownMenuContent
      id="sessMenu"
      aria-labelledby="runSwitch"
      ref={menuRef}
      side="bottom"
      align="start"
      sideOffset={MENU_SIDE_OFFSET}
      alignOffset={MENU_ALIGN_OFFSET}
      collisionPadding={MENU_COLLISION_PADDING}
      className="max-h-(--radix-dropdown-menu-content-available-height) w-menu max-w-(--radix-dropdown-menu-content-available-width)"
      onOpenAutoFocus={focusCheckedRow}
      onEscapeKeyDown={(event) => event.stopPropagation()}
    >
      {active.length > 0 && (
        <>
          <DropdownMenuLabel>Active</DropdownMenuLabel>
          {rows(active)}
        </>
      )}
      {past.length > 0 && (
        <>
          <DropdownMenuLabel>{past.every(isToday) ? "Earlier today" : "Earlier"}</DropdownMenuLabel>
          {rows(past)}
        </>
      )}
      <p className="s-foot mx-m mt-s mb-2xs text-note leading-snug text-ink-3">
        {served
          ? "Read from session files on this machine and any OpenTelemetry sent to Trellis."
          : "Finished runs stay here until the end of the day. Synthetic demo sessions."}
      </p>
    </DropdownMenuContent>
  );
}
