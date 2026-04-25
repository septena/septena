export function parseHHMM(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(mm)) return null;
  return h + mm / 60;
}

/**
 * Derive the user's "ideal bedtime" from recent Oura rows as the median
 * observed bedtime over the last N days. Post-midnight values (<12:00) are
 * treated as +24h so the median doesn't pull toward noon when the user
 * occasionally goes to bed after midnight. The returned hour can therefore
 * exceed 24 — callers decide whether to render it on a same-day axis.
 */
export function idealBedtimeFromOura(
  rows: { date?: string | null; bedtime?: string | null }[],
  opts: { days?: number; before?: string } = {},
): number | null {
  const { days = 14, before } = opts;
  const sorted = [...rows]
    .filter((r) => r.bedtime && (!before || (r.date ?? "") < before))
    .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
    .slice(-days);
  const hours: number[] = [];
  for (const r of sorted) {
    const h = parseHHMM(r.bedtime);
    if (h == null) continue;
    hours.push(h < 12 ? h + 24 : h);
  }
  if (!hours.length) return null;
  hours.sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  const raw = hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2;
  return raw - 1;
}

export function formatHour(hour: number): string {
  const wrapped = ((hour % 24) + 24) % 24;
  const hh = Math.floor(wrapped) % 24;
  const mm = Math.round((wrapped % 1) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm === 60 ? 0 : mm).padStart(2, "0")}`;
}
