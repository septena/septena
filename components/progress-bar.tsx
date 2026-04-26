/** Shared thin progress bar with an "over target" affordance.
 *
 *  When `value > 1`, the bar fills 100% and a small white dot is placed at
 *  `(1/value) * 100%` to mark where the target line sits relative to today's
 *  value (so 2× target → dot at 50%).
 */
type ProgressBarProps = {
  /** 0..∞ where 1.0 = target. Values > 1 render the over-target marker. */
  value: number;
  color?: string;
  className?: string;
};

export function ProgressBar({ value, color, className }: ProgressBarProps) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const over = safe > 1;
  const pct = over ? 100 : safe * 100;
  const dotPct = over ? (1 / safe) * 100 : null;
  return (
    <div className={(className ?? "h-1.5") + " relative w-full overflow-hidden rounded-full bg-muted"}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
      {dotPct !== null && (
        <span
          aria-hidden
          title="target"
          className="absolute top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm ring-1 ring-black/10"
          style={{ left: `${dotPct}%` }}
        />
      )}
    </div>
  );
}
