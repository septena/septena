"use client";

import useSWR from "swr";
import { getSettings } from "@/lib/api";

// Short animation — user wanted "very quickly, if any animation".
const BAR_ANIMATION_MS = 320;

export type BarAnimationProps = {
  isAnimationActive: boolean;
  animationDuration: number;
  animationEasing: "ease-out";
};

/** Spread onto any Recharts <Bar> so chart histograms raise from the baseline
 *  when the card mounts. Honors the `animations.histograms_raise` setting —
 *  off = instant render, on = quick ease-out raise. */
export function useBarAnimation(): BarAnimationProps {
  const { data } = useSWR("settings", getSettings, { revalidateOnFocus: false });
  const enabled = data?.animations?.histograms_raise ?? true;
  return {
    isAnimationActive: enabled,
    animationDuration: enabled ? BAR_ANIMATION_MS : 0,
    animationEasing: "ease-out",
  };
}
