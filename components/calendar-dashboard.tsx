"use client";

import useSWR from "swr";
import { getCalendar, type CalendarEvent } from "@/lib/api";
import { useSectionColor } from "@/hooks/use-sections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionStatusBar } from "@/components/section-status-bar";

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

function localDay(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function groupByDay(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const out: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    const day = localDay(ev.start);
    (out[day] ??= []).push(ev);
  }
  return out;
}

export function CalendarDashboard() {
  const { data, isLoading } = useSWR("calendar-page", getCalendar, {
    refreshInterval: 300_000,
    shouldRetryOnError: false,
  });
  const color = useSectionColor("calendar");
  const grouped = groupByDay(data?.events ?? []);
  const days = Object.keys(grouped).sort();

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6 pb-24 sm:px-6 sm:pb-6">
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && data?.error && (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">{data.error}</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !data?.error && days.length === 0 && (
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

      <SectionStatusBar section="calendar" />
    </main>
  );
}
