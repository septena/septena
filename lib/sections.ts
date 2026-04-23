// Static fallback registry loaded from the shared JSON manifest. The backend
// remains authoritative at runtime via /api/sections; this file provides the
// same defaults for first paint / offline fallback.

import sectionManifest from "@/sections/manifest.json";

export type SectionKey = keyof typeof sectionManifest;

export type Section = {
  key: SectionKey;
  label: string;
  path: string;
  apiBase: string;
  dataDir: string;
  // HSL accent — used for active tab pill, chart lines, CTAs.
  color: string;
  // Short pitch shown on the root launcher card.
  tagline: string;
  // Decorative glyph shown in the per-page header ({emoji} {label}). Also
  // used on the section's settings card. Empty string renders nothing.
  emoji: string;
};

type ManifestSection = {
  key: SectionKey;
  label: string;
  path: string;
  apiBase: string;
  dataDir: string;
  color: string;
  tagline: string;
  emoji: string;
};

const manifest = sectionManifest as Record<SectionKey, ManifestSection>;

export const SECTIONS: Record<SectionKey, Section> = Object.fromEntries(
  Object.entries(manifest).map(([key, value]) => [key, {
    key: key as SectionKey,
    label: value.label,
    path: value.path,
    apiBase: value.apiBase,
    dataDir: value.dataDir,
    color: value.color,
    tagline: value.tagline,
    emoji: value.emoji,
  }]),
) as Record<SectionKey, Section>;

export const SECTION_LIST: Section[] = Object.values(SECTIONS);

/** Sections shown in chrome (topnav pills, mobile home FAB menu). Excludes
 *  meta pages like "correlations" that live on the homepage bottom action
 *  row instead. Single source of truth for nav parity — if it belongs in
 *  the topnav, it belongs in the FAB menu, and vice versa. */
export const NAV_SECTION_LIST: Section[] = SECTION_LIST.filter(
  (s) => s.key !== "correlations",
);
