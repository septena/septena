"use client";

import { TodayTimeline } from "@/components/today-timeline";

function shiftDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

export function TimelineWeekView({ endDate }: { endDate: string }) {
  const dates = Array.from({ length: 7 }, (_, i) => shiftDate(endDate, i - 6));

  return (
    <section className="mt-10 border-t border-border/40 pt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-foreground">Last 7 Days</h2>
      </div>
      {dates.map((d) => (
        <TodayTimeline key={d} date={d} />
      ))}
    </section>
  );
}
