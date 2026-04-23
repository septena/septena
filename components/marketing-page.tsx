import Image from "next/image";
import Link from "next/link";

type SectionBlock = {
  slug: string;
  name: string;
  tagline: string;
  explainer: string;
  screenshot: string;
  demoHref: string;
};

const SECTIONS: SectionBlock[] = [
  {
    slug: "overview",
    name: "Overview",
    tagline: "today at a glance",
    explainer:
      "The landing view. Every section contributes a small tile so I can see the day's shape — did I eat, did I move, did I sleep — without clicking through eleven pages. The only screen that's really meant to be glanced at.",
    screenshot: "/screenshots/overview.png",
    demoHref: "/demo/overview",
  },
  {
    slug: "exercise",
    name: "Exercise",
    tagline: "sessions, PRs, progressions",
    explainer:
      "I log strength, cardio, and mobility work the same day I do it. The app tracks progression per exercise, surfaces personal records, and suggests the next logical workout based on what I did last time. Strength is where the data pays off; cardio and mobility get lighter treatment.",
    screenshot: "/screenshots/exercise.png",
    demoHref: "/demo/exercise",
  },
  {
    slug: "nutrition",
    name: "Nutrition",
    tagline: "meals, macros, fasting",
    explainer:
      "One entry per eating event, with protein, fat, carbs, kcal, and a free-form ingredient list. Targets are ranges, not points — a protein minimum, a kcal window — because nutrition is a zone to stay inside of, not a number to hit. Fasting and eating windows are computed from the timestamps.",
    screenshot: "/screenshots/nutrition.png",
    demoHref: "/demo/nutrition",
  },
  {
    slug: "habits",
    name: "Habits",
    tagline: "the fixed daily checklist",
    explainer:
      "Habits aren't ad-hoc. They're a set of recurring things I want to do every day, bucketed morning / afternoon / evening so the order matches the day. Checked off, they generate an event file. No streaks theater.",
    screenshot: "/screenshots/habits.png",
    demoHref: "/demo/habits",
  },
  {
    slug: "supplements",
    name: "Supplements",
    tagline: "daily stack, honest streaks",
    explainer:
      "The same pattern as habits, without the buckets. A fixed list, one checkbox per day per item. Shows which I've been consistent with and which I've been quietly skipping.",
    screenshot: "/screenshots/supplements.png",
    demoHref: "/demo/supplements",
  },
  {
    slug: "caffeine",
    name: "Caffeine",
    tagline: "when, how much, what method",
    explainer:
      "Espresso at 08:45, filter at 14:00. Bean presets speed up logging. Useful for correlating with sleep quality later, and just to see the shape of the week.",
    screenshot: "/screenshots/caffeine.png",
    demoHref: "/demo/caffeine",
  },
  {
    slug: "chores",
    name: "Chores",
    tagline: "recurring, deferrable",
    explainer:
      "Water the plants, change the sheets, clean the coffee machine. Each chore has a cadence in days. Complete it and the next due date is pushed out; defer it and the new due date is recorded explicitly. The current state is derived by replaying the log — no \"current\" is stored anywhere.",
    screenshot: "/screenshots/chores.png",
    demoHref: "/demo/chores",
  },
  {
    slug: "sleep",
    name: "Sleep",
    tagline: "from Oura",
    explainer:
      "Sleep score, stages, HRV, resting heart rate, time in bed. Read-only. Septena doesn't try to be a sleep tracker; it makes the data I already have easy to live with alongside everything else.",
    screenshot: "/screenshots/sleep.png",
    demoHref: "/demo/sleep",
  },
  {
    slug: "body",
    name: "Body",
    tagline: "from Withings",
    explainer:
      "Weight and body fat, pulled from the scale. Nothing I have to type in. Most days I don't look; on the days I do, I want the trend, not yesterday's number.",
    screenshot: "/screenshots/body.png",
    demoHref: "/demo/body",
  },
  {
    slug: "health",
    name: "Health",
    tagline: "from Apple Health Auto Export",
    explainer:
      "Steps, active energy, exercise minutes, VO₂ max, cardio recovery, respiratory rate. Whatever my watch captures, aggregated daily.",
    screenshot: "/screenshots/health.png",
    demoHref: "/demo/health",
  },
  {
    slug: "insights",
    name: "Insights",
    tagline: "cross-section patterns",
    explainer:
      "The point of having everything in one place. Does caffeine after 14:00 actually cost me sleep? Do heavy leg days move weight? Still early — correlations get trustworthy around ninety days of data.",
    screenshot: "/screenshots/insights.png",
    demoHref: "/demo/insights",
  },
];

export function MarketingPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-16 sm:py-24">
      <Header />
      <Why />
      <Sections />
      <HowDataWorks />
      <Install />
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="mb-16 max-w-xl">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Septena</h1>
      <p className="mt-3 text-lg text-muted-foreground">
        A local-first personal health command center.
      </p>
    </header>
  );
}

function Why() {
  return (
    <section className="mb-20 max-w-xl space-y-4 text-base leading-relaxed sm:text-lg">
      <p>
        I wanted one place for the things I track about myself — workouts, meals, habits, sleep,
        supplements, caffeine, chores — that wasn't five apps, didn't phone home, and didn't lock my
        data inside someone else's database.
      </p>
      <p>
        Septena is that place. Everything I log lives as plain YAML files in a folder on my
        machine. The app is a Next.js frontend and a FastAPI backend that read and write those
        files. That's the whole architecture.
      </p>
      <p>
        The name is from <em>heptad</em> — seven. Most views in the app span a week because that's
        the window where patterns show up and weekends stop distorting the signal.
      </p>
      <div className="flex flex-wrap gap-3 pt-4">
        <Link
          href="/demo"
          className="inline-flex items-center rounded-full border border-orange-500 bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
        >
          Try the demo
        </Link>
        <Link
          href="#install"
          className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-orange-500 hover:text-orange-500"
        >
          Install it yourself
        </Link>
      </div>
    </section>
  );
}

function Sections() {
  return (
    <section className="mb-20 space-y-16">
      {SECTIONS.map((s) => (
        <SectionBlockView key={s.slug} section={s} />
      ))}
    </section>
  );
}

function SectionBlockView({ section }: { section: SectionBlock }) {
  return (
    <article className="grid gap-6 md:grid-cols-2 md:items-center md:gap-10">
      <div className="space-y-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{section.name}</h2>
          <p className="text-sm text-muted-foreground">{section.tagline}</p>
        </div>
        <p className="text-base leading-relaxed text-foreground/90">{section.explainer}</p>
        <Link
          href={section.demoHref}
          className="inline-block text-sm font-medium text-orange-500 hover:text-orange-600"
        >
          Try {section.name.toLowerCase()} demo →
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
        <Image
          src={section.screenshot}
          alt={`${section.name} screenshot`}
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
          ~/Documents/septena-data/Bases/&lt;Section&gt;/Log/
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
        You can edit the files directly in any text editor. You can back them up with Git. You can
        write scripts against them. When Septena stops working for you, your data is still there in
        a format you can read.
      </p>
      <p>
        There's no account, no sync server, no cloud. If you want sync, point your vault folder at
        iCloud Drive or Dropbox.
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
      <ol className="list-decimal space-y-1 pl-6">
        <li>Clone the repo</li>
        <li>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">npm install</code> and{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
            pip install -r requirements.txt
          </code>
        </li>
        <li>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">npm run seed</code> to
          populate a demo vault, or point{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
            $SEPTENA_DATA_DIR
          </code>{" "}
          at an empty folder to start fresh
        </li>
        <li>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">npm run dev</code> —
          open <span className="font-mono text-sm">http://localhost:4444</span>
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
          href="https://github.com/"
          className="text-foreground underline-offset-4 hover:text-orange-500 hover:underline"
        >
          Source on GitHub
        </a>
        .
      </p>
    </footer>
  );
}
