import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeptenaMark } from "@/components/septena-mark";
import {
  MARKETING_SECTIONS,
  getMarketingSection,
  type MarketingSection,
} from "@/lib/marketing-sections";

export const dynamic = "force-static";

export function generateStaticParams() {
  return MARKETING_SECTIONS.map((s) => ({ section: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section: slug } = await params;
  const section = getMarketingSection(slug);
  if (!section) return {};
  const title = section.name;
  const description = section.summary;
  return {
    title,
    description,
    keywords: section.keywords,
    alternates: { canonical: `/about/${section.slug}` },
    openGraph: {
      title: `${title} · Septena`,
      description,
      url: `/about/${section.slug}`,
      type: "article",
      images: [{ url: section.screenshot, width: 1200, height: 800, alt: `${section.name} — ${section.tagline}` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [section.screenshot],
    },
  };
}

export default async function AboutSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: slug } = await params;
  const section = getMarketingSection(slug);
  if (!section) notFound();

  const index = MARKETING_SECTIONS.findIndex((s) => s.slug === slug);
  const prev = index > 0 ? MARKETING_SECTIONS[index - 1] : null;
  const next = index < MARKETING_SECTIONS.length - 1 ? MARKETING_SECTIONS[index + 1] : null;
  const accentSoft = `color-mix(in oklab, ${section.accent} 12%, transparent)`;
  const accentBorder = `color-mix(in oklab, ${section.accent} 28%, var(--border))`;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-16 sm:py-20">
      <nav className="mb-10 flex items-center justify-between text-sm">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <SeptenaMark className="h-5 w-5" />
          <span>Septena</span>
        </Link>
        <Link
          href={section.demoHref}
          className="inline-flex items-center rounded-full border px-3 py-1.5 font-medium transition-colors"
          style={{ color: section.accent, borderColor: accentBorder, backgroundColor: accentSoft }}
        >
          Try the {section.name.toLowerCase()} demo →
        </Link>
      </nav>

      <header className="mb-10 max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-wider" style={{ color: section.accent }}>
          {section.tagline}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{section.name}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{section.summary}</p>
      </header>

      <div
        className="mb-12 overflow-hidden rounded-xl border bg-muted/30"
        style={{ borderColor: accentBorder }}
      >
        <Image
          src={section.screenshot}
          alt={`${section.name} screenshot — ${section.tagline}`}
          width={2400}
          height={1500}
          priority
          className="h-auto w-full"
        />
      </div>

      <section className="mb-12 max-w-2xl space-y-4 text-base leading-relaxed sm:text-lg">
        <p>{section.explainer}</p>
      </section>

      <section className="mb-12 max-w-2xl">
        <h2 className="mb-3 text-xl font-semibold tracking-tight">What makes it different</h2>
        <ul className="ml-5 list-disc space-y-2 text-base leading-relaxed text-foreground/90">
          {section.highlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </section>

      {section.dataShape && (
        <section className="mb-12 max-w-2xl space-y-3 text-base leading-relaxed">
          <h2 className="text-xl font-semibold tracking-tight">The data on disk</h2>
          <p className="text-muted-foreground">
            One file at{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
              {section.dataShape.path}
            </code>
          </p>
          <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed sm:text-sm">
            {section.dataShape.yaml}
          </pre>
          <p className="text-sm text-muted-foreground">
            Plain YAML — any editor, any script, any language model can read it.
          </p>
        </section>
      )}

      <section className="mb-12 max-w-2xl">
        <h2 className="mb-3 text-xl font-semibold tracking-tight">How it works</h2>
        <ul className="ml-5 list-disc space-y-2 text-base leading-relaxed text-foreground/90">
          {section.howItWorks.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </section>

      <section
        className="mb-12 rounded-xl border p-6"
        style={{ borderColor: accentBorder, backgroundColor: accentSoft }}
      >
        <h2 className="text-xl font-semibold tracking-tight">See it live</h2>
        <p className="mt-2 text-muted-foreground">
          The demo runs on seeded data — nothing to install, no account.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={section.demoHref}
            className="inline-flex items-center rounded-full border border-brand-accent bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-accent-strong"
          >
            Open the {section.name.toLowerCase()} demo
          </Link>
          <Link
            href="/#install"
            className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-brand-accent hover:text-brand-accent"
          >
            Install Septena
          </Link>
        </div>
      </section>

      <SectionNav prev={prev} next={next} />
    </main>
  );
}

function SectionNav({ prev, next }: { prev: MarketingSection | null; next: MarketingSection | null }) {
  return (
    <nav className="grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
      {prev ? (
        <Link
          href={`/about/${prev.slug}`}
          className="rounded-lg border border-border p-4 transition-colors hover:border-brand-accent"
        >
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Previous</div>
          <div className="mt-1 font-medium" style={{ color: prev.accent }}>
            ← {prev.name}
          </div>
          <div className="text-sm text-muted-foreground">{prev.tagline}</div>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/about/${next.slug}`}
          className="rounded-lg border border-border p-4 text-right transition-colors hover:border-brand-accent"
        >
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Next</div>
          <div className="mt-1 font-medium" style={{ color: next.accent }}>
            {next.name} →
          </div>
          <div className="text-sm text-muted-foreground">{next.tagline}</div>
        </Link>
      ) : (
        <div />
      )}
    </nav>
  );
}
