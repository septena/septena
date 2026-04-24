"use client";

import useSWR from "swr";
import { getSections, getSettings, type SectionMeta } from "@/lib/api";
import { SECTIONS, SECTION_LIST, type SectionKey } from "@/lib/sections";

// Merges code-side wiring (path, apiBase, dataDir, defaults) with user
// overrides from settings.yaml. Falls back to the static registry when
// settings haven't loaded yet (first paint + offline).
function buildSectionsFromSettings(
  settings: Awaited<ReturnType<typeof getSettings>> | undefined,
): SectionMeta[] {
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
    // Pre-API: only surface user-set metadata. Anything unset renders neutral
    // / empty until /api/sections resolves, so defaults can't flash in and
    // then get replaced by the user's real override.
    return {
      key,
      label: o.label ?? base.label,
      emoji: o.emoji ?? "",
      color: o.color ?? "hsl(var(--muted-foreground))",
      tagline: o.tagline ?? "",
      enabled: o.enabled ?? true,
      show_in_nav: o.show_in_nav ?? o.enabled ?? true,
      show_on_dashboard: o.show_on_dashboard ?? o.enabled ?? true,
      order: idx,
      path: base.path,
      apiBase: base.apiBase,
      dataDir: base.dataDir,
    };
  });
}

export function useSections(): SectionMeta[] {
  // /api/sections is the authoritative merged list — wiring from code,
  // metadata from settings.yaml, plus any keys added by optional local
  // extensions that aren't present in the static code-side registry.
  const { data: registry } = useSWR("sections-registry", getSections, { revalidateOnFocus: false });
  const { data: settings } = useSWR("settings", getSettings, { revalidateOnFocus: false });
  if (registry && registry.length > 0) return registry;
  return buildSectionsFromSettings(settings);
}

/** Nav-visible sections: enabled only, excluding meta entries like
 *  `correlations` that live on the homepage action row instead of the tab bar.
 *  Falls back to the static registry merged with any loaded settings so the
 *  topnav stays populated when /api/sections fails (backend down) or hasn't
 *  resolved yet — an empty nav was indistinguishable from a broken app. */
export function useNavSections(): SectionMeta[] {
  const { data: registry } = useSWR("sections-registry", getSections, { revalidateOnFocus: false });
  const { data: settings } = useSWR("settings", getSettings, { revalidateOnFocus: false });
  const source = registry && registry.length > 0 ? registry : buildSectionsFromSettings(settings);
  return source.filter((s) => s.show_in_nav && s.key !== "correlations");
}

/** Dashboard-grid sections: visible on the home overview. Correlations is
 *  excluded — it lives on the bottom action row. */
export function useDashboardSections(): SectionMeta[] {
  const sections = useSections();
  return sections.filter((s) => s.show_on_dashboard && s.key !== "correlations");
}

export function useSection(key: SectionKey): SectionMeta | undefined {
  return useSections().find((s) => s.key === key);
}

/** Accent color for a section, honoring settings.yaml overrides. Falls back
 *  to a neutral token when the section's color hasn't been resolved yet —
 *  never a colorful default, so unresolved state can't be mistaken for a
 *  real accent. */
export function useSectionColor(key: SectionKey): string {
  return useSection(key)?.color ?? "hsl(var(--muted-foreground))";
}
