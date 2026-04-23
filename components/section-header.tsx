"use client";

import { usePathname } from "next/navigation";
import { useSections } from "@/hooks/use-sections";
import { PageHeaderTitle } from "@/components/page-header";
import { SECTION_HEADER_ACTION_SLOT_ID } from "@/components/section-header-action";
import { usePageHeaderContext } from "@/components/page-header-context";

// Rendered beneath the sticky nav on every section page. Matches the current
// section against pathname (prefix match so /exercise/session/... still
// counts) and displays `{emoji} {label}` with the tagline as a subtitle.
// Returns null on the root launcher and settings so those pages keep their
// own chrome.
export function SectionHeader() {
  const pathname = usePathname();
  const sections = useSections();
  const { isRefreshing, getSubtitle } = usePageHeaderContext();

  if (pathname === "/septena") return null;

  // Longest-path match wins so `/body` doesn't get shadowed by a future "/"-
  // prefixed section. Skips sections with an empty path (none today, but the
  // filter keeps correlations-style entries from accidentally matching all
  // routes if someone sets path="").
  const match = sections
    .filter((s) => s.path && (pathname === s.path || pathname.startsWith(s.path + "/")))
    .sort((a, b) => b.path.length - a.path.length)[0];

  if (!match) return null;

  return (
    <header className="mx-auto w-full max-w-6xl px-4 pb-0 pt-6 sm:px-6 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <PageHeaderTitle
            title={match.label}
            subtitle={getSubtitle(match.key) ?? match.tagline ?? undefined}
            emoji={match.emoji || undefined}
            color={match.color || undefined}
            refreshing={isRefreshing(match.key)}
          />
        </div>
        <div id={SECTION_HEADER_ACTION_SLOT_ID} className="shrink-0" />
      </div>
    </header>
  );
}
