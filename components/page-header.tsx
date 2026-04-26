import type { ReactNode } from "react";
import { BackLink } from "@/components/back-link";
import { Emoji } from "@/components/ui/emoji";

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
      {back && <BackLink href={back.href} label={back.label} className="mb-4" />}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-3">
          <Emoji className="text-3xl leading-none sm:text-4xl">{emoji}</Emoji>
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
