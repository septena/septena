"use client";

import Link from "next/link";
import useSWR from "swr";
import { getWeather } from "@/lib/api";
import { usePageHeaderSubtitle } from "@/components/page-header-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function WeatherDashboard() {
  const { data, isLoading, error } = useSWR("weather-page", getWeather, {
    refreshInterval: 600_000,
    shouldRetryOnError: false,
  });
  const color = "var(--section-accent)";
  usePageHeaderSubtitle("weather", data?.location?.split(",")[0]?.trim() ?? null);

  return (
    <>
      {error || (!isLoading && !data) ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-sm text-muted-foreground">
              Set a location in <Link href="/settings" className="underline hover:text-foreground">Settings</Link> to see weather.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Now</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-3">
                <p className="text-5xl font-semibold tabular-nums" style={{ color }}>
                  {data?.current.temperature != null ? Math.round(data.current.temperature) : "—"}
                  <span className="ml-1 text-lg font-normal text-muted-foreground">{data?.temp_unit}</span>
                </p>
                <p className="text-sm text-muted-foreground">{data?.current.label}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                {data?.current.humidity != null && <span>Humidity {Math.round(data.current.humidity)}%</span>}
                {data?.current.wind_kmh != null && <span>Wind {Math.round(data.current.wind_kmh)} km/h</span>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">7-day forecast</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border/60">
                {(data?.daily ?? []).map((d) => (
                  <li key={d.date} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="font-medium">{d.weekday}</span>
                    <span className="flex-1 px-3 text-xs text-muted-foreground">{d.label}</span>
                    {d.precip_pct != null && d.precip_pct > 0 && (
                      <span className="text-xs text-muted-foreground tabular-nums">{d.precip_pct}%</span>
                    )}
                    <span className="tabular-nums" style={{ color }}>
                      {d.high != null ? Math.round(d.high) : "—"}°
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {d.low != null ? Math.round(d.low) : "—"}°
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

    </>
  );
}
