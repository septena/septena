/** Shared date utilities used across all dashboards. */

/** Today as YYYY-MM-DD in local time. */
export function todayLocalISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** N days ago as YYYY-MM-DD in local time. */
export function daysAgoLocalISO(days: number) {
  const now = new Date();
  now.setDate(now.getDate() - days);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Shift a YYYY-MM-DD by N days (can be negative). Local time, DST-safe. */
export function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, (d ?? 1) + delta);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** "Today" / "Yesterday" / "Mon, 14 Apr" — short label for date-nav readout. */
export function relativeDayLabel(iso: string): string {
  const today = todayLocalISO();
  if (iso === today) return "Today";
  if (iso === addDaysISO(today, -1)) return "Yesterday";
  if (iso === addDaysISO(today, 1)) return "Tomorrow";
  return formatDateWeekday(iso);
}

/** Current time as HH:MM. */
export function nowHHMM() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** Format ISO date like "Apr 10" — safe against UTC off-by-one. */
export function shortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Title-case 3-letter weekday like "Sun" — used for chart tick labels. */
export function weekdayShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

/** Format ISO date like "01 Jan 2025". */
export function formatDateLong(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

/** Format ISO date like "Mon, 10 Apr". */
export function formatDateWeekday(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** Format ISO date like "10 Apr". */
export function formatDateShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Relative timestamp: "Just now", "23m ago", "3h ago", "2d ago", or a date. */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return "—";
  const that = new Date(value);
  if (Number.isNaN(that.getTime())) return value;
  const diffSec = Math.max(0, Math.round((Date.now() - that.getTime()) / 1000));
  if (diffSec < 60) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(that);
}

// ── Chart axis helpers ────────────────────────────────────────────────────

/** Hour-of-day ticks every 2h, 00–24 inclusive. Shared by cannabis and
 *  caffeine time-of-day histograms. */
export const HOUR_TICKS_2H: number[] = Array.from({ length: 13 }, (_, i) => i * 2);

/** Format an integer hour tick as zero-padded 24-hour "HH". */
export const formatHourTick = (v: number): string => String(v % 24).padStart(2, "0");

/** Title-case weekday for 7-day historical chart ticks: "Sun Mon Tue … Sat".
 *  Accepts ISO "YYYY-MM-DD"; returns the input unchanged if unparseable. */
export function formatWeekdayTick(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return WD[new Date(y, m - 1, d).getDay()];
}

/** Single-letter weekday for dense/narrow chart ticks: "S M T W T F S". */
export function formatWeekdayTickNarrow(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return "SMTWTFS"[new Date(y, m - 1, d).getDay()] ?? iso;
}

/** Options for computeStreak. */
export interface ComputeStreakOptions {
  /** Number of zero-days to allow before breaking the streak. Default 0.
   *  Set to 1 to skip today if incomplete, then count consecutive days. */
  graceDays?: number;
}

/** Count consecutive days from the end of a daily array where done > 0.
 *  By default (graceDays=0) today is included — streak is 0 if today has
 *  zero completions. Pass graceDays=1 to skip an incomplete today before
 *  counting, matching the "day isn't over yet" behaviour. */
export function computeStreak(
  daily: { done: number }[] | undefined,
  opts: ComputeStreakOptions = {},
): number {
  if (!daily || daily.length === 0) return 0;
  const graceDays = opts.graceDays ?? 0;
  let streak = 0;
  let i = daily.length - 1;
  let graceUsed = 0;
  for (; i >= 0; i--) {
    if (daily[i].done > 0) {
      streak++;
      graceUsed = 0;
    } else if (graceUsed < graceDays) {
      graceUsed++;
    } else {
      break;
    }
  }
  return streak;
}
