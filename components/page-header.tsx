import Link from "next/link";
import type { ReactNode } from "react";

type TitleProps = {
  title: string;
  subtitle?: ReactNode;
  emoji?: string;
  color?: string;
  back?: { href: string; label: string };
  /** Show a pulsing "refreshing…" indicator inline next to the title. */
  refreshing?: boolean;
};

// Inner markup — emoji + title + optional subtitle, with an optional back
// pill above. Shared between PageHeader (used inside main) and SectionHeader
// (the global header for section routes) so both render identically.
export function PageHeaderTitle({ title, subtitle, emoji, color, back, refreshing }: TitleProps) {
  return (
    <>
      {back && (
        <Link
          href={back.href}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-foreground/30 hover:bg-muted"
        >
          <span aria-hidden>←</span>
          <span>{back.label}</span>
        </Link>
      )}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-3">
          {emoji && (
            <span aria-hidden className="text-3xl leading-none sm:text-4xl">
              {emoji}
            </span>
          )}
          <h1
            className="text-3xl font-semibold tracking-tight sm:text-4xl"
            style={color ? { color } : undefined}
          >
            {title}
          </h1>
        </div>
        {refreshing && (
          <span className="text-xs text-muted-foreground animate-pulse">refreshing…</span>
        )}
      </div>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </>
  );
}

// Page header used inside a page's `<main>`. SectionHeader (rendered from
// the root layout for section routes) uses PageHeaderTitle directly with
// its own outer wrapper.
export function PageHeader(props: TitleProps) {
  return (
    <header className="mb-6">
      <PageHeaderTitle {...props} />
    </header>
  );
}
