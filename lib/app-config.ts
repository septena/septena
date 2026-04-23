"use client";

import useSWR from "swr";
import { getAppConfig, type AppConfig } from "@/lib/api";
import { SECTION_LIST } from "@/lib/sections";

const FALLBACK: AppConfig = {
  paths: {
    vault: "~/Documents/septena-data",
    health: "~/Documents/septena-data/Health",
    integrations: "~/.config/openclaw",
    cache: "~/.config/septena",
  },
  // Optimistic — avoids flashing onboarding while the config is loading.
  // If the vault really is missing, the real response corrects this.
  vault_exists: true,
  vault_has_sections: true,
  integrations: { oura: false, withings: false, apple_health: false },
  // While loading, assume all known sections are available so nav doesn't
  // flash a reduced set. The real response narrows it on arrival.
  available_sections: SECTION_LIST.map((s) => s.key),
};

/** Resolved server config (vault path, integration availability, section
 *  visibility). Returns a non-null fallback while loading — callers don't
 *  need to guard on undefined just to render a path hint.
 *
 *  For nav filtering use `useNavSections()` from hooks/use-sections.ts
 *  instead — it already combines the /api/sections `enabled` flag with
 *  user-defined section order from settings.yaml. */
export function useAppConfig(): AppConfig {
  const { data } = useSWR<AppConfig>("app-config", getAppConfig, {
    revalidateOnFocus: false,
    // Config is set by env vars at server boot — never changes at runtime.
    revalidateIfStale: false,
    dedupingInterval: Infinity,
  });
  return data ?? FALLBACK;
}
