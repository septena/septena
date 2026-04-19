import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Muted bordered status container shared by section status bars and the
 *  bottom-of-viewport load-time indicator. Chrome is fixed (border, bg,
 *  text color, radius, size); padding/margin/position come from className. */
export function StatusPill({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
