"use client";

import { useSelectedDate } from "@/hooks/use-selected-date";
import { TodayTimeline } from "@/components/today-timeline";

function shiftDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

export function WeekDashboard() {
  const { date: today } = useSelectedDate();
  const dates = Array.from({ length: 7 }, (_, i) => shiftDate(today, i - 6));

  return (
    <main className="mx-auto min-h-screen w-full min-w-0 max-w-2xl overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-foreground">Week</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{dates[0]} — {today}</p>
      </div>
      {dates.map((d) => (
        <TodayTimeline key={d} date={d} />
      ))}
    </main>
  );
}
