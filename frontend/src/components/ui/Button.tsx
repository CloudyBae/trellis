import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "./cn";

export const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center border-0 transition-colors disabled:cursor-default disabled:opacity-45 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        solid: "bg-ink font-bold text-ground hover:bg-ink-2",
        ghost: "bg-transparent enabled:hover:bg-wash",
        link: "bg-transparent p-zero text-ink-2 underline decoration-stem underline-offset-3 hover:text-ink",
        segment:
          "bg-transparent text-ink-2 hover:text-ink aria-pressed:bg-pane aria-pressed:font-medium aria-pressed:text-ink aria-pressed:shadow-raised",
      },
    },
    defaultVariants: { variant: "ghost" },
  },
);

export function Button({
  className,
  variant,
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button type={type} className={cn(buttonVariants({ variant }), className)} {...props} />;
}
