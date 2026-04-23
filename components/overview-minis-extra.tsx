"use client";

import useSWR from "swr";
import React, { useMemo } from "react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { SectionCard } from "@/components/overview-dashboard";
import { getGutDay, getGutHistory } from "@/lib/api-gut";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function weekdayShort(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return WEEKDAY_SHORT[d.getDay()];
}

function GutMini() {
  const today = new Date().toISOString().slice(0, 10);
  const { data, isLoading } = useSWR(
    ["overview-gut", today],
    async () => {
      const [day, history] = await Promise.all([getGutDay(today), getGutHistory(7)]);
      return { day, history };
    },
    { refreshInterval: 60_000 },
  );

  const color = "var(--section-accent)";
  const day = data?.day;
  const history = data?.history;
  const movements = day?.movement_count ?? 0;
  const openDiscomfort = day?.open_discomfort ?? 0;
  const totalDiscomfort = day?.total_discomfort_h ?? 0;
  const maxBlood = day?.max_blood ?? 0;

  const week = (history?.daily ?? []).slice(-7);
  const weekMovements = week.reduce((s, d) => s + (d.movements ?? 0), 0);
  const chartData = useMemo(
    () => week.map((d) => ({ date: weekdayShort(d.date), v: d.movements ?? 0 })),
    [week],
  );
  const chartConfig = { v: { label: "movements", color } } satisfies ChartConfig;

  return (
    <SectionCard section="gut" loading={isLoading}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Today</p>
          <p className="text-lg font-semibold tabular-nums" style={{ color }}>
            {movements}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">7-day</p>
          <p className="text-lg font-semibold tabular-nums" style={{ color }}>
            {weekMovements}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          7-day movements
        </p>
        <ChartContainer config={chartConfig} className="h-20 w-full pointer-events-none">
          <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "currentColor", className: "text-muted-foreground" }}
              interval={0}
              height={20}
              tickMargin={6}
            />
            <YAxis hide domain={[0, "auto"]} />
            <Bar dataKey="v" fill={color} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </div>
      {(openDiscomfort > 0 || totalDiscomfort > 0 || maxBlood > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {openDiscomfort > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-white"
              style={{ backgroundColor: color }}
            >
              {openDiscomfort} open
            </span>
          )}
          {totalDiscomfort > 0 && (
            <span className="rounded-full border border-border px-2 py-0.5 tabular-nums text-muted-foreground">
              {totalDiscomfort}h discomfort
            </span>
          )}
          {maxBlood > 0 && (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-red-600">
              blood {maxBlood}
            </span>
          )}
        </div>
      )}
    </SectionCard>
  );
}

export const EXTRA_MINIS: Record<string, React.FC> = {
  gut: GutMini,
};
