"use client";

import useSWR from "swr";
import { getSettings } from "@/lib/api";

/** Returns the current value of the global `display.show_emoji` toggle.
 *
 *  Defaults to `true` while settings are loading so emoji-on users (the
 *  default state) see no flicker. Emoji-off users will see emoji briefly
 *  on cold load before the SWR fetch resolves — acceptable, and consistent
 *  with how other settings-derived hooks (e.g. `useBarAnimation`) handle
 *  the same race. */
export function useShowEmoji(): boolean {
  const { data } = useSWR("settings", getSettings, { revalidateOnFocus: false });
  return data?.display?.show_emoji ?? true;
}
