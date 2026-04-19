"use client";

import useSWR from "swr";
import { getCalendar, type CalendarEvent } from "@/lib/api";
import { SECTIONS } from "@/lib/sections";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function groupByDay(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const out: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const day = ev.start.slice(0, 10);
    (out[day] ??= []).push(ev);
  }
  return out;
}

export function CalendarDashboard() {
  const { data, isLoading } = useSWR("calendar-page", getCalendar, {
    refreshInterval: 300_000,
    shouldRetryOnError: false,
  });
  const color = SECTIONS.calendar.color;
  const grouped = groupByDay(data?.events ?? []);
  const days = Object.keys(grouped).sort();

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:pb-6">
      <PageHeader
        title="Calendar"
        emoji={SECTIONS.calendar.emoji}
        color={color}
        subtitle={
          data?.source === "fake"
            ? "Showing demo data — grant Calendar.app access to see real events."
            : "Today and the next 7 days."
        }
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && days.length === 0 && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">No upcoming events.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {days.map((day) => (
          <Card key={day}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{fmtDate(day)}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border/60">
                {grouped[day].map((e, i) => (
                  <li key={`${e.start}-${i}`} className="flex items-baseline gap-3 py-2 text-sm">
                    <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                      {e.all_day ? "all-day" : fmtTime(e.start)}
                    </span>
                    <span className="flex-1 truncate" style={{ color }}>{e.title}</span>
                    {e.calendar && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{e.calendar}</span>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
