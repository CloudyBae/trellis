import type { ComponentProps } from "react";
import { cn } from "./cn";

export function Badge({ className, ...props }: ComponentProps<"b">) {
  return <b className={cn("text-title font-bold tabular-nums", className)} {...props} />;
}
