import { SECTIONS as SECTION_REGISTRY } from "@/lib/sections";

export type MarketingSection = {
  slug: string;
  name: string;
  tagline: string;
  summary: string;
  explainer: string;
  screenshot: string;
  demoHref: string;
  accent: string;
  // Extended content used only on the per-section page.
  highlights: string[];
  dataShape?: { path: string; yaml: string };
  howItWorks: string[];
  keywords: string[];
};

export const MARKETING_SECTIONS: MarketingSection[] = [
  {
    slug: "overview",
    name: "Overview",
    tagline: "today at a glance",
    summary: "Every section contributes one tile so the whole day fits on one screen.",
    explainer:
      "The landing view. Every section contributes a small tile so I can see the day's shape — did I eat, did I move, did I sleep — without clicking through eleven pages. The only screen that's really meant to be glanced at.",
    screenshot: "/screenshots/overview.png",
    demoHref: "/demo",
    accent: "var(--brand-accent)",
    highlights: [
      "One tile per active section, driven by live data from your data folder.",
      "Sections you turn off in settings disappear from the grid — no dead cards.",
      "Designed to be the home screen of a pinned browser tab, not something you stare at.",
    ],
    howItWorks: [
      "Tiles read from the same endpoints the section pages use — no duplicated aggregation logic.",
      "Section order and visibility come from Settings/settings.yaml, so you decide what shows up.",
      "The page never blocks on a slow integration; each tile resolves independently.",
    ],
    keywords: [
      "personal dashboard",
      "local-first life tracker",
      "daily overview",
      "yaml health dashboard",
    ],
  },
  {
    slug: "training",
    name: "Training",
    tagline: "sessions, PRs, progressions",
    summary: "Log strength, cardio, and mobility; Septena tracks progression and suggests the next session.",
    explainer:
      "I log strength, cardio, and mobility work the same day I do it. The app tracks progression per exercise, surfaces personal records, and suggests the next logical workout based on what I did last time. Strength is where the data pays off; cardio and mobility get lighter treatment.",
    screenshot: "/screenshots/exercise.png",
    demoHref: "/demo/training",
    accent: SECTION_REGISTRY.training.color,
    highlights: [
      "Per-exercise progression charts with visible PRs — not a generic \"weight over time\" blur.",
      "Next-workout suggestion based on the last session of the same split, so getting started is one tap.",
      "Strength, cardio (Zone 2 weekly target), and mobility modeled separately because they reward different treatment.",
      "Cardio and mobility taxonomies are configurable; you're not stuck with a fixed exercise library.",
    ],
    dataShape: {
      path: "Training/Log/2026-04-11--1730--01.md",
      yaml: `---
date: "2026-04-11"
time: "17:30"
type: strength
exercises:
  - name: Deadlift
    sets:
      - { reps: 5, weight_kg: 140 }
      - { reps: 5, weight_kg: 140 }
      - { reps: 3, weight_kg: 150 }
section: training
---`,
    },
    howItWorks: [
      "One file per session; exercises are a list of sets, each with reps and weight.",
      "PRs are computed from the whole log at request time, not stored — rewriting history is just editing a file.",
      "Cardio sessions are their own type, with distance / duration / HR zones; charts keep them out of strength progression.",
    ],
    keywords: [
      "strength tracker yaml",
      "local workout log",
      "progressive overload tracker",
      "self-hosted training log",
    ],
  },
  {
    slug: "nutrition",
    name: "Nutrition",
    tagline: "meals, macros, fasting",
    summary: "One entry per meal with macros; targets are ranges, not points.",
    explainer:
      "One entry per eating event, with protein, fat, carbs, kcal, and a free-form ingredient list. Targets are ranges, not points — a protein minimum, a kcal window — because nutrition is a zone to stay inside of, not a number to hit. Fasting and eating windows are computed from the timestamps.",
    screenshot: "/screenshots/nutrition.png",
    demoHref: "/demo/nutrition",
    accent: SECTION_REGISTRY.nutrition.color,
    highlights: [
      "Macros as ranges (protein min, kcal window) — no shaming over going 30 kcal \"over\".",
      "Fasting and eating windows fall out of the timestamps automatically; no extra \"start fast\" button.",
      "Entries are human-readable YAML, so you can fix a typo from last Tuesday in any text editor.",
      "No food database — you type what you ate. Faster than scrolling, always accurate to your kitchen.",
    ],
    dataShape: {
      path: "Nutrition/Log/2026-04-11--1115--01.md",
      yaml: `---
date: "2026-04-11"
time: "11:15"
protein_g: 22
fat_g: 14
carbs_g: 30
kcal: 340
foods:
  - Breakfast
  - 2 eggs (~12g protein)
  - Coffee with milk
section: nutrition
---
First meal of the day`,
    },
    howItWorks: [
      "foods[0] is the meal title (bold in the UI); the rest are details you can skim or search later.",
      "Daily target ranges live in settings.yaml so a cutting / maintenance switch is a one-line edit.",
      "Free-form notes go in the Markdown body, keeping the frontmatter fields stable and machine-readable.",
    ],
    keywords: [
      "macro tracker yaml",
      "local nutrition log",
      "protein tracker no cloud",
      "fasting window tracker",
    ],
  },
  {
    slug: "habits",
    name: "Habits",
    tagline: "the fixed daily checklist",
    summary: "A set list of recurring habits, bucketed morning / afternoon / evening.",
    explainer:
      "Habits aren't ad-hoc. They're a set of recurring things I want to do every day, bucketed morning / afternoon / evening so the order matches the day. Checked off, they generate an event file. No streaks theater.",
    screenshot: "/screenshots/habits.png",
    demoHref: "/demo/habits",
    accent: SECTION_REGISTRY.habits.color,
    highlights: [
      "Fixed set, not an infinite to-do list — the point is to stay on the same small program.",
      "Time-of-day buckets match how the day actually flows; evening habits don't clutter the morning view.",
      "Toggling produces a plain event file per completion, so history is reconstructable and exportable.",
      "Adding, renaming, or removing a habit is a config edit — past event files stay valid.",
    ],
    dataShape: {
      path: "Habits/habits-config.yaml",
      yaml: `habits:
  - id: creatine
    name: Creatine 5g
    bucket: morning
  - id: meditation
    name: Meditation 10min
    bucket: morning
  - id: read
    name: Read 30min
    bucket: evening`,
    },
    howItWorks: [
      "Config file defines the master list; every completion writes its own dated event file.",
      "The UI merges config + today's events to render checkboxes; toggling off unlinks the event cleanly.",
      "No stored \"streak\" — the backend replays events when you ask, so editing the log never corrupts state.",
    ],
    keywords: [
      "habit tracker local",
      "markdown habit tracker",
      "daily checklist app",
      "yaml habits",
    ],
  },
  {
    slug: "supplements",
    name: "Supplements",
    tagline: "daily stack, honest streaks",
    summary: "A fixed stack, one checkbox per dose per day. Shows what you've actually been taking.",
    explainer:
      "The same pattern as habits, without the buckets. A fixed list, one checkbox per day per item. Shows which I've been consistent with and which I've been quietly skipping.",
    screenshot: "/screenshots/supplements.png",
    demoHref: "/demo/supplements",
    accent: SECTION_REGISTRY.supplements.color,
    highlights: [
      "Same engine as habits — reliable, trivial to extend.",
      "\"Honest streaks\" just means the streak is computed from actual events; no grace days, no fudging.",
      "Good for evaluating whether something is worth continuing: if the checkbox isn't getting ticked, that is the answer.",
    ],
    howItWorks: [
      "supplements-config.yaml lists your stack; one event file per dose.",
      "History view shows per-supplement compliance over the last N days, not just a total.",
    ],
    keywords: ["supplement tracker", "local supplement log", "daily stack tracker"],
  },
  {
    slug: "caffeine",
    name: "Caffeine",
    tagline: "when, how much, what method",
    summary: "Espresso at 08:45, filter at 14:00. Bean presets, method, dose.",
    explainer:
      "Espresso at 08:45, filter at 14:00. Bean presets speed up logging. Useful for correlating with sleep quality later, and just to see the shape of the week.",
    screenshot: "/screenshots/caffeine.png",
    demoHref: "/demo/caffeine",
    accent: SECTION_REGISTRY.caffeine.color,
    highlights: [
      "Method matters (espresso vs. filter vs. cold brew) — caffeine doses differ, and so does how you feel.",
      "Bean presets turn a typical log into two taps.",
      "Primary payoff is the late-afternoon timestamp you'll cross-reference against sleep score.",
    ],
    howItWorks: [
      "Each cup is an event file with time, bean, method, and dose.",
      "Bean presets live in the config; method taxonomy is hardcoded for now.",
    ],
    keywords: ["caffeine tracker", "coffee log app", "caffeine vs sleep"],
  },
  {
    slug: "chores",
    name: "Chores",
    tagline: "recurring, deferrable",
    summary: "Cadence-based chores; complete or defer, and the log decides what's due.",
    explainer:
      "Water the plants, change the sheets, clean the coffee machine. Each chore has a cadence in days. Complete it and the next due date is pushed out; defer it and the new due date is recorded explicitly. The current state is derived by replaying the log — no \"current\" is stored anywhere.",
    screenshot: "/screenshots/chores.png",
    demoHref: "/demo/chores",
    accent: SECTION_REGISTRY.chores.color,
    highlights: [
      "Cadence in days, not a rigid weekly schedule — the dishwasher filter isn't a Tuesday thing.",
      "Two actions: complete, or defer (by a day or to the weekend). That's the whole vocabulary.",
      "State is derived by replaying events, so editing or deleting a chore event recomputes cleanly.",
    ],
    howItWorks: [
      "Definitions live under Chores/Definitions/ with a cadence_days field.",
      "Every completion / deferral is its own event file; the current due date is computed on request.",
    ],
    keywords: ["recurring chores app", "cadence-based todo", "household chore tracker"],
  },
  {
    slug: "sleep",
    name: "Sleep",
    tagline: "from Oura",
    summary: "Sleep score, stages, HRV, resting heart rate — read from Oura, not entered manually.",
    explainer:
      "Sleep score, stages, HRV, resting heart rate, time in bed. Read-only. Septena doesn't try to be a sleep tracker; it makes the data I already have easy to live with alongside everything else.",
    screenshot: "/screenshots/sleep.png",
    demoHref: "/demo/sleep",
    accent: SECTION_REGISTRY.sleep.color,
    highlights: [
      "Pulls from the Oura API — nothing to type in, nothing to remember to sync.",
      "Lives next to Nutrition and Caffeine in the same UI, which is the whole point.",
      "Read-only by design; if the wearable is wrong, fix it there.",
    ],
    howItWorks: [
      "Backend hits Oura's sleep + daily_sleep endpoints and caches locally so the page loads instantly.",
      "Credentials live outside the repo; there's no cloud component in between.",
    ],
    keywords: ["oura dashboard", "self-hosted sleep tracker", "hrv dashboard"],
  },
  {
    slug: "body",
    name: "Body",
    tagline: "from Withings",
    summary: "Weight and body fat from the scale — trend, not yesterday's number.",
    explainer:
      "Weight and body fat, pulled from the scale. Nothing I have to type in. Most days I don't look; on the days I do, I want the trend, not yesterday's number.",
    screenshot: "/screenshots/body.png",
    demoHref: "/demo/body",
    accent: SECTION_REGISTRY.body.color,
    highlights: [
      "Withings API, read-only.",
      "Trend view emphasised over the latest reading so daily noise doesn't hijack your morning.",
    ],
    howItWorks: [
      "Backend fetches weight + body-fat series from Withings; the frontend plots the trend.",
    ],
    keywords: ["withings dashboard", "weight trend tracker", "body fat log"],
  },
  {
    slug: "health",
    name: "Health",
    tagline: "from Apple Health Auto Export",
    summary: "Steps, active energy, VO₂ max, cardio recovery — whatever the watch captures.",
    explainer:
      "Steps, active energy, exercise minutes, VO₂ max, cardio recovery, respiratory rate. Whatever my watch captures, aggregated daily.",
    screenshot: "/screenshots/health.png",
    demoHref: "/demo/health",
    accent: SECTION_REGISTRY.health.color,
    highlights: [
      "Works off a Health Auto Export drop — no HealthKit integration, no phone required at runtime.",
      "Daily aggregates (sums for steps / energy, latest-per-day for episodic metrics like HRV).",
      "The section you look at when you want a second opinion on how the week actually went.",
    ],
    howItWorks: [
      "Health Auto Export writes a JSON snapshot to ~/.config/openclaw/health_auto_export/latest.json.",
      "Backend aggregates per-metric into daily rows — sums, latest, or average depending on the metric.",
    ],
    keywords: ["apple health dashboard", "health auto export viewer", "vo2 max tracker"],
  },
  {
    slug: "insights",
    name: "Insights",
    tagline: "cross-section patterns",
    summary: "Does late caffeine actually cost you sleep? The whole point of having it all in one place.",
    explainer:
      "The point of having everything in one place. Does caffeine after 14:00 actually cost me sleep? Do heavy leg days move weight? Still early — correlations get trustworthy around ninety days of data.",
    screenshot: "/screenshots/insights.png",
    demoHref: "/demo/insights",
    accent: SECTION_REGISTRY.correlations.color,
    highlights: [
      "Cross-section correlations: caffeine → sleep, training volume → HRV, meal timing → weight trend.",
      "Honest about uncertainty — correlations aren't shown until there's enough data to be non-embarrassing.",
      "The justification for logging at all. If none of this tells you anything, you can stop.",
    ],
    howItWorks: [
      "Runs over the same YAML event files the rest of the app writes, so there's no extra data pipeline.",
      "Correlations are visibly labeled with sample size — small-n patterns are flagged, not hidden.",
    ],
    keywords: ["personal analytics", "quantified self correlations", "life log insights"],
  },
];

export function getMarketingSection(slug: string): MarketingSection | undefined {
  return MARKETING_SECTIONS.find((s) => s.slug === slug);
}
