import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentProps } from "react";
import { cn } from "./cn";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

type DropdownMenuContentProps = ComponentProps<typeof DropdownMenuPrimitive.Content> & {
  onOpenAutoFocus?: (event: Event) => void;
};

export function DropdownMenuContent({ className, sideOffset = 0, ...props }: DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-40 overflow-auto overscroll-contain rounded-popover border border-rule bg-pane p-s text-ink",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn("mx-sm mt-sm mb-xs text-meta font-bold text-ink-3 first:mt-2xs", className)}
      {...props}
    />
  );
}

export function DropdownMenuRadioItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      className={cn(
        "w-full cursor-pointer rounded-lg px-m py-sm text-left transition-colors aria-checked:bg-wash-strong data-highlighted:bg-wash",
        className,
      )}
      {...props}
    />
  );
}
