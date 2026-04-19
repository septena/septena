"use client";

import useSWR from "swr";
import { getSettings, type SectionMeta } from "@/lib/api";
import { SECTIONS, SECTION_LIST, type SectionKey } from "@/lib/sections";

// Merges code-side wiring (path, apiBase, obsidianDir, defaults) with user
// overrides from settings.yaml. Reads /api/settings rather than
// /api/sections so live overrides still flow on backends that pre-date the
// /api/sections endpoint. Falls back to the static registry when settings
// haven't loaded yet (first paint + offline).
function buildSections(settings: Awaited<ReturnType<typeof getSettings>> | undefined): SectionMeta[] {
  const overrides = (settings?.sections ?? {}) as Record<string, Partial<SectionMeta>>;
  const order = settings?.section_order ?? [];

  const allKeys = SECTION_LIST.map((s) => s.key);
  const orderedKeys: SectionKey[] = [
    ...order.filter((k): k is SectionKey => allKeys.includes(k as SectionKey)),
    ...allKeys.filter((k) => !order.includes(k)),
  ];

  return orderedKeys.map((key, idx) => {
    const base = SECTIONS[key];
    const o = overrides[key] ?? {};
    return {
      key,
      label: o.label ?? base.label,
      emoji: o.emoji ?? base.emoji,
      color: o.color ?? base.color,
      tagline: o.tagline ?? base.tagline,
      enabled: o.enabled ?? true,
      order: idx,
      path: base.path,
      apiBase: base.apiBase,
      obsidianDir: base.obsidianDir,
    };
  });
}

export function useSections(): SectionMeta[] {
  const { data } = useSWR("settings", getSettings, { revalidateOnFocus: false });
  return buildSections(data);
}

/** Nav-visible sections: enabled only, excluding meta entries like
 *  `correlations` that live on the homepage action row instead of the tab bar. */
export function useNavSections(): SectionMeta[] {
  return useSections().filter((s) => s.enabled && s.key !== "correlations");
}

export function useSection(key: SectionKey): SectionMeta | undefined {
  return useSections().find((s) => s.key === key);
}
