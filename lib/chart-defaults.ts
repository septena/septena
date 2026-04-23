// Shared Recharts prop defaults. Spread onto primitives rather than wrapping
// them — Recharts walks React.Children by displayName to lay out axes and
// gridlines, so wrapper components silently break chart layout.
//
// Usage: <CartesianGrid {...CHART_GRID} />, <XAxis {...WEEKDAY_X_AXIS} />, etc.
// Override by passing any prop after the spread: <YAxis {...Y_AXIS} width={44} />.

import type { CartesianGridProps, XAxisProps, YAxisProps } from "recharts";

import { formatWeekdayTick } from "@/lib/date-utils";

// Stroke is the section accent at low opacity — picked up via the inherited
// --section-accent CSS var so every chart's gridlines tint with the user's
// section color instead of Recharts' default gray. Eink mode strips
// --section-accent back to foreground (black), so gridlines stay visible.
export const CHART_GRID: Partial<CartesianGridProps> = {
  vertical: false,
  strokeDasharray: "3 3",
  stroke: "var(--section-accent)",
  strokeOpacity: 0.15,
};

export const CHART_GRID_FULL: Partial<CartesianGridProps> = {
  strokeDasharray: "3 3",
  stroke: "var(--section-accent)",
  strokeOpacity: 0.15,
};

export const X_AXIS_DATE: Partial<XAxisProps> = {
  dataKey: "date",
  tickLine: false,
  axisLine: false,
};

export const WEEKDAY_X_AXIS: Partial<XAxisProps> = {
  dataKey: "date",
  tickLine: false,
  axisLine: false,
  tickFormatter: (v: string) => formatWeekdayTick(v),
  tick: { fontSize: 10 },
};

export const Y_AXIS: Partial<YAxisProps> = {
  tickLine: false,
  axisLine: false,
  domain: [0, "auto"],
  width: 36,
};
