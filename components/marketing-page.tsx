import Image from "next/image";
import Link from "next/link";
import { SeptenaMark } from "@/components/septena-mark";
import { GitHubStarButton, GITHUB_URL } from "@/components/github-star-button";
import { MARKETING_SECTIONS, type MarketingSection } from "@/lib/marketing-sections";

export function MarketingPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 sm:py-16">
      <Nav />
      <Hero />
      <Why />
      <BringYourOwnAgent />
      <Sections />
      <HowDataWorks />
      <Install />
      <Footer />
    </main>
  );
}

function Nav() {
  return (
    <nav className="mb-12 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <SeptenaMark className="h-7 w-7" />
        <span className="text-lg font-semibold tracking-tight">Septena</span>
      </div>
      <GitHubStarButton />
    </nav>
  );
}

function Hero() {
  return (
    <section className="mb-20 grid gap-6 md:grid-cols-2 md:items-center md:gap-10">
      <div className="max-w-xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          One place for every signal your body sends.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground sm:text-xl">
          A local-first personal health command center — training, nutrition, habits, sleep,
          vitals. Your data stays on your disk as plain YAML, ready for any AI agent you trust.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/demo"
            className="inline-flex items-center rounded-full border border-brand-accent bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-accent-strong"
          >
            Try the demo
          </Link>
          <Link
            href="#install"
            className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-brand-accent hover:text-brand-accent"
          >
            Install it yourself
          </Link>
          <Link
            href="#sections"
            className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-brand-accent hover:text-brand-accent"
          >
            See what it tracks
          </Link>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
        <Image
          src="/screenshots/overview.png"
          alt="Septena overview — one tile per section showing today's state across training, nutrition, habits, sleep, and more."
          width={1200}
          height={800}
          priority
          className="h-auto w-full"
        />
      </div>
    </section>
  );
}

function Why() {
  return (
    <section className="mb-20 max-w-2xl space-y-4 text-base leading-relaxed sm:text-lg">
      <p>
        I wanted one place for the things I track about myself — workouts, meals, habits, sleep,
        supplements, caffeine, chores — that was not five apps, did not phone home, and did not
        lock my data inside someone else&apos;s database.
      </p>
      <p>
        Septena is that place. Everything I log lives as plain YAML files in a folder on my
        machine. The app is a Next.js frontend and a FastAPI backend that read and write those
        files. That&apos;s the whole architecture.
      </p>
      <p>
        The name is from <em>heptad</em> — seven. Most views in the app span a week because that
        is the window where patterns start to show up.
      </p>
    </section>
  );
}

function BringYourOwnAgent() {
  return (
    <section className="mb-20 max-w-3xl space-y-5 text-base leading-relaxed sm:text-lg">
      <h2 className="text-2xl font-semibold tracking-tight">Bring your own agent</h2>
      <p>
        The reason Septena stores everything as plain text under a folder you control isn&apos;t
        purity — it&apos;s leverage. Your health log sits next to your notes, in a format any
        model can read, and every event is git-versioned by default.
      </p>
      <p>
        That means you don&apos;t need Septena to have an &quot;AI feature.&quot; Point Claude
        Code, Cursor, an Obsidian plugin, or a local LLM at{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          ~/Documents/septena-data/
        </code>{" "}
        and ask it whatever you want:
      </p>
      <ul className="ml-6 list-disc space-y-2 text-foreground/90">
        <li>
          <span className="font-medium">Structured → structured:</span> &quot;Plot my protein
          intake vs. next-morning HRV for the last 90 days.&quot; Your agent reads the YAML
          directly — no API, no schema docs.
        </li>
        <li>
          <span className="font-medium">Unstructured → structured:</span> paste a cafe receipt or
          a photo of a food label and have your agent append a well-formed nutrition event into
          the right folder.
        </li>
        <li>
          <span className="font-medium">Structured → unstructured:</span> &quot;Draft a note to
          my doctor summarizing the last three months of sleep, weight, and training volume.&quot;
          All the source files are right there to cite.
        </li>
      </ul>
      <p>
        Because the folder is a git repo, every change an agent makes is a diff you can review,
        revert, or blame. The barrier between &quot;my structured data&quot; and &quot;my messy
        notes&quot; dissolves: it&apos;s all one data folder, and whichever model you trust most this
        month can work across both.
      </p>
      <p>
        To make that reliable, every section ships a{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">SKILL.md</code> —
        a compact contract describing the filename pattern, YAML schema, and example entries.
        Point your agent at one skill and it can log into that section correctly from the first
        try, no guessing.
      </p>
      <p className="text-sm text-muted-foreground">
        Septena doesn&apos;t ship an agent. It ships the substrate that makes your agent useful.
      </p>
    </section>
  );
}

function Sections() {
  return (
    <section id="sections" className="mb-20 space-y-16">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight">What Septena tracks</h2>
        <p className="mt-2 text-muted-foreground">
          Eleven sections, one data folder. Each links to a deeper page with the data shape, the
          design decisions, and a live demo.
        </p>
      </div>
      {MARKETING_SECTIONS.map((s) => (
        <SectionBlockView key={s.slug} section={s} />
      ))}
    </section>
  );
}

function SectionBlockView({ section }: { section: MarketingSection }) {
  const accentSoft = `color-mix(in oklab, ${section.accent} 12%, transparent)`;
  const accentBorder = `color-mix(in oklab, ${section.accent} 28%, var(--border))`;

  return (
    <article className="grid gap-6 md:grid-cols-2 md:items-center md:gap-10">
      <div className="space-y-3">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight">{section.name}</h3>
          <p className="text-sm text-muted-foreground">{section.tagline}</p>
        </div>
        <p className="text-base leading-relaxed text-foreground/90">{section.explainer}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            href={`/about/${section.slug}`}
            className="inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors"
            style={{
              color: section.accent,
              borderColor: accentBorder,
              backgroundColor: accentSoft,
            }}
          >
            Read more →
          </Link>
          <Link
            href={section.demoHref}
            className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-brand-accent hover:text-brand-accent"
          >
            Try the demo
          </Link>
        </div>
      </div>
      <div
        className="overflow-hidden rounded-lg border bg-muted/30"
        style={{ borderColor: accentBorder }}
      >
        <Image
          src={section.screenshot}
          alt={`${section.name} screenshot — ${section.tagline}`}
          width={1200}
          height={800}
          className="h-auto w-full"
        />
      </div>
    </article>
  );
}

function HowDataWorks() {
  return (
    <section className="mb-20 max-w-xl space-y-4 text-base leading-relaxed sm:text-lg">
      <h2 className="text-2xl font-semibold tracking-tight">How the data works</h2>
      <p>
        Every event is a YAML file under{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
          ~/Documents/septena-data/&lt;Section&gt;/Log/
        </code>
        . A meal looks like this:
      </p>
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed sm:text-sm">
        {`---
date: "2026-04-11"
time: "11:15"
protein_g: 22
fat_g: 14
carbs_g: 30
kcal: 340
foods: [Breakfast, 2 eggs, Coffee]
section: nutrition
---`}
      </pre>
      <p>
        Edit the files in any text editor. Back them up with git. Write scripts against them.
        When Septena stops working for you, your data is still there in a format you can read —
        and that any language model, today or in ten years, can read too.
      </p>
      <p>
        There is no account, no sync server, no cloud. If you want sync, point your data folder
        at iCloud Drive or Dropbox, or just <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">git push</code> it.
      </p>
    </section>
  );
}

function Install() {
  return (
    <section
      id="install"
      className="mb-20 max-w-xl space-y-4 text-base leading-relaxed sm:text-lg"
    >
      <h2 className="text-2xl font-semibold tracking-tight">Install</h2>
      <p>
        Septena runs locally on your machine. Today that means a Node frontend and a Python backend
        talking to a folder on disk. A packaged Mac app and an iOS companion are in progress, but
        not yet.
      </p>
      <p>
        The intended setup today is: you already have Node and Python installed, and you are happy
        to run two local processes while using the app.
      </p>
      <ol className="list-decimal space-y-1 pl-6">
        <li>Clone the repo</li>
        <li>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">npm install</code> and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
            pip install -r requirements.txt
          </code>
        </li>
        <li>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">npm run seed-demo</code>{" "}
          to populate demo data, or point{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
            $SEPTENA_DATA_DIR
          </code>{" "}
          at an empty folder to start fresh
        </li>
        <li>
          Run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
            uvicorn main:app --port 7000 --reload
          </code>{" "}
          and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">npm run dev</code>,
          then open <span className="font-mono text-sm">http://localhost:7777</span>
        </li>
      </ol>
      <p className="text-sm text-muted-foreground">
        Requires macOS (Linux should work; untested), Node 20+, Python 3.11+.
      </p>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border pt-8 text-sm text-muted-foreground">
      <p>
        Built by Michell Zappa. MIT licensed.{" "}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="text-foreground underline-offset-4 hover:text-brand-accent hover:underline"
        >
          Source on GitHub
        </a>
        .
      </p>
    </footer>
  );
}
