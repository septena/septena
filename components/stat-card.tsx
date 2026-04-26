import { ProgressBar } from "@/components/progress-bar";

/** Shared stat card used across all dashboard sections. */
export type StatCardSize = "sm" | "md" | "lg";

const STAT_CARD_RADIUS: Record<StatCardSize, string> = {
  sm: "rounded-xl",
  md: "rounded-2xl",
  lg: "rounded-3xl",
};

type StatCardProps = {
  label: string;
  value: string | number | null;
  sublabel?: string;
  unit?: string;
  /** 0..∞ ratio where 1 = target. Renders a progress bar below the value;
   *  values > 1 render an "over target" marker dot. */
  progress?: number;
  /** Color for the progress bar (CSS color string). */
  color?: string;
  /** Desired direction: "up" = higher is better, "down" = lower is better. */
  direction?: "up" | "down";
  /** Optional target value shown as muted text. */
  target?: string;
  /** Card radius tier. sm=entry rows, md=stat cards, lg=overview tiles. Default md. */
  size?: StatCardSize;
};

export function StatCard({ label, value, sublabel, unit, progress, color, direction, target, size = "md" }: StatCardProps) {
  const display = value === null ? "—" : value;
  const displayWithUnit = value !== null && unit ? `${display}${unit}` : display;

  return (
    <div className={STAT_CARD_RADIUS[size] + " border border-border bg-card p-4"}>
      <div className="flex items-center gap-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">{label}</p>
        {direction && (
          <span className="text-[10px] text-muted-foreground/60" title={direction === "up" ? "Higher is better" : "Lower is better"}>
            {direction === "up" ? "↑" : "↓"}
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold font-mono tabular-nums" style={color ? { color } : undefined}>
        {displayWithUnit}
      </p>
      {sublabel && <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>}
      {target && <p className="mt-0.5 text-[10px] text-muted-foreground/60">Target: {target}</p>}
      {progress !== undefined && (
        <div className="mt-3">
          <ProgressBar value={progress} color={color} />
        </div>
      )}
    </div>
  );
}
