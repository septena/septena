"use client";

import { usePathname } from "next/navigation";
import { type CSSProperties, type ReactNode } from "react";
import { useSectionColor, useSections } from "@/hooks/use-sections";
import type { SectionKey } from "@/lib/sections";

function sectionAccentVars(color: string): CSSProperties {
  return {
    "--section-accent": color,
    // Custom properties resolve where they are defined, not where they are
    // consumed, so the full accent ramp has to live on the same element that
    // overrides the section accent. Leaving these at :root made every
    // exercise shade keep the neutral foreground color instead of the user's
    // chosen section color.
    "--section-accent-soft": `color-mix(in oklab, ${color} 14%, transparent)`,
    "--section-accent-strong": `oklch(from ${color} calc(l - 0.10) c h)`,
    "--section-accent-shade-1": color,
    "--section-accent-shade-2": `oklch(from ${color} calc(l + 0.06) c h)`,
    "--section-accent-shade-3": `oklch(from ${color} calc(l + 0.13) calc(c * 0.85) h)`,
  } as CSSProperties;
}

/** Sets `--section-accent` (and derived shade vars) on a wrapper div
 *  scoped to whichever section owns the current pathname. Descendants
 *  consume the accent via `var(--section-accent)` instead of passing a
 *  `color` prop through the tree.
 *
 *  Why this lives in the root layout: the sticky section header's action
 *  slot (`#section-header-action-slot`) and the page content must BOTH
 *  sit inside the scope so portaled buttons and the page itself see the
 *  same accent. Pathname matching is the same longest-prefix-wins rule
 *  used by SectionHeader, keeping the two sources consistent.
 *
 *  On `/` (launcher) no section matches — vars fall back to :root's
 *  `--app-accent` defaults. In e-ink mode, `.eink` rules override the
 *  vars with `!important`, so the inline style here is ignored. */
export function SectionThemeRoot({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const sections = useSections();

  const match = sections
    .filter((s) => s.path && (pathname === s.path || pathname.startsWith(s.path + "/")))
    .sort((a, b) => b.path.length - a.path.length)[0];

  const color = match?.color;
  const style: CSSProperties | undefined = color ? sectionAccentVars(color) : undefined;

  return (
    <div style={style} className="contents">
      {children}
    </div>
  );
}

/** Explicit-key variant for places that need to scope the section accent
 *  to a region whose section ISN'T determined by pathname — e.g. each
 *  per-section tile on the overview launcher, or a settings preview card.
 *  Use SectionThemeRoot for the page-level wrapper instead. */
export function SectionTheme({
  sectionKey,
  className,
  children,
}: {
  sectionKey: SectionKey;
  className?: string;
  children: ReactNode;
}) {
  const color = useSectionColor(sectionKey);
  const style = sectionAccentVars(color);
  return (
    <div style={style} className={className ?? "contents"}>
      {children}
    </div>
  );
}
