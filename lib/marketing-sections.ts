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
    summary: "One tile per section. The whole day fits on one screen.",
    explainer:
      "The landing view. Every section contributes a small tile so I can see the shape of the day (did I eat, did I move, did I sleep) without clicking through eleven pages. It is the one screen meant to be glanced at.",
    screenshot: "/screenshots/overview.png",
    demoHref: "/demo",
    accent: "var(--brand-accent)",
    highlights: [
      "One tile per active section, reading from your folder live.",
      "Sections you turn off in settings stop appearing.",
      "Meant for a pinned browser tab you glance at, not a screen you stare at.",
    ],
    howItWorks: [
      "Tiles call the same endpoints the section pages use.",
      "Section order and visibility come from Settings/settings.yaml.",
      "Each tile resolves independently, so a slow integration does not block the page.",
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
    summary: "Log strength, cardio, and mobility. Septena tracks progression and suggests the next session.",
    explainer:
      "I log strength, cardio, and mobility the same day I do them. The app tracks progression per exercise, surfaces personal records, and suggests the next workout based on the last one of the same split. Strength is where the data pays off; cardio and mobility get lighter treatment.",
    screenshot: "/screenshots/exercise.png",
    demoHref: "/demo/training",
    accent: SECTION_REGISTRY.training.color,
    highlights: [
      "Per-exercise progression charts with PRs marked.",
      "Next-workout suggestion based on your last session of the same split.",
      "Strength, cardio, and mobility modeled separately. Cardio uses a weekly Zone 2 target.",
      "Cardio and mobility libraries are editable. You are not stuck with a fixed exercise list.",
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
      "One file per session. Exercises are a list of sets, each with reps and weight.",
      "PRs are computed from the whole log at request time. Rewriting history is just editing a file.",
      "Cardio sessions are their own type with distance, duration, and HR zones.",
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
    summary: "One entry per meal with macros. Targets are ranges.",
    explainer:
      "One entry per eating event: protein, fat, carbs, kcal, and a free-form ingredient list. Targets are ranges (a protein minimum, a kcal window) because nutrition is a zone to stay inside of. Fasting and eating windows fall out of the timestamps.",
    screenshot: "/screenshots/nutrition.png",
    demoHref: "/demo/nutrition",
    accent: SECTION_REGISTRY.nutrition.color,
    highlights: [
      "Macros as ranges. A protein minimum and a kcal window, not a single target.",
      "Fasting and eating windows come from the timestamps. No separate start-fast button.",
      "Entries are YAML. You can fix last Tuesday in any text editor.",
      "No food database. You type what you ate.",
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
      "foods[0] is the meal title (bold in the UI). The rest are details you can skim or search.",
      "Daily target ranges live in settings.yaml. Switching cutting vs. maintenance is a one-line edit.",
      "Notes go in the Markdown body, keeping frontmatter fields stable.",
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
    summary: "A set list of recurring habits, bucketed morning, afternoon, evening.",
    explainer:
      "Habits are not ad-hoc. They are a set of things I want to do every day, bucketed morning, afternoon, evening so the order matches the day. Checking one off writes an event file.",
    screenshot: "/screenshots/habits.png",
    demoHref: "/demo/habits",
    accent: SECTION_REGISTRY.habits.color,
    highlights: [
      "A fixed set, not an infinite to-do list.",
      "Time-of-day buckets keep evening habits out of the morning view.",
      "Each completion is its own event file, so history is reconstructable.",
      "Adding or removing a habit is a config edit. Past event files stay valid.",
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
      "The config file defines the master list. Every completion writes a dated event file.",
      "The UI merges config plus today's events. Toggling off unlinks the event cleanly.",
      "No streak is stored. The backend replays events on request, so editing the log is safe.",
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
    summary: "A fixed stack. One checkbox per dose per day.",
    explainer:
      "Same pattern as habits, without the buckets. A fixed list, one checkbox per day per item. Shows which ones I take consistently and which ones I skip.",
    screenshot: "/screenshots/supplements.png",
    demoHref: "/demo/supplements",
    accent: SECTION_REGISTRY.supplements.color,
    highlights: [
      "Same engine as habits.",
      "Streaks are computed from actual events. No grace days, no fudging.",
      "Useful for deciding what to keep: if the box isn't getting ticked, that is the answer.",
    ],
    howItWorks: [
      "supplements-config.yaml lists the stack. One event file per dose.",
      "The history view shows per-supplement compliance over the last N days.",
    ],
    keywords: ["supplement tracker", "local supplement log", "daily stack tracker"],
  },
  {
    slug: "caffeine",
    name: "Caffeine",
    tagline: "when, how much, what method",
    summary: "Espresso at 08:45, filter at 14:00. Bean presets, method, dose.",
    explainer:
      "Espresso at 08:45, filter at 14:00. Bean presets speed up logging. Useful later for checking against sleep quality, and for seeing the shape of the week.",
    screenshot: "/screenshots/caffeine.png",
    demoHref: "/demo/caffeine",
    accent: SECTION_REGISTRY.caffeine.color,
    highlights: [
      "Method matters. Espresso, filter, and cold brew have different doses.",
      "Bean presets turn a log into two taps.",
      "The main payoff is the late-afternoon timestamp to check against sleep score.",
    ],
    howItWorks: [
      "Each cup is an event file with time, bean, method, and dose.",
      "Bean presets live in the config. Method taxonomy is hardcoded for now.",
    ],
    keywords: ["caffeine tracker", "coffee log app", "caffeine vs sleep"],
  },
  {
    slug: "chores",
    name: "Chores",
    tagline: "recurring, deferrable",
    summary: "Cadence-based chores. Complete or defer, and the log decides what's due.",
    explainer:
      "Water the plants, change the sheets, clean the coffee machine. Each chore has a cadence in days. Completing it pushes the next due date out by that cadence. Deferring it records a new explicit due date. The current state is derived by replaying the log.",
    screenshot: "/screenshots/chores.png",
    demoHref: "/demo/chores",
    accent: SECTION_REGISTRY.chores.color,
    highlights: [
      "Cadence in days, not a fixed weekday. The dishwasher filter isn't a Tuesday thing.",
      "Two actions: complete, or defer by a day or to the weekend.",
      "State is derived from events, so editing or deleting an event recomputes cleanly.",
    ],
    howItWorks: [
      "Definitions live under Chores/Definitions/ with a cadence_days field.",
      "Every completion or deferral is its own event file. The current due date is computed on request.",
    ],
    keywords: ["recurring chores app", "cadence-based todo", "household chore tracker"],
  },
  {
    slug: "tasks",
    name: "Tasks",
    tagline: "one-off intentional work",
    summary: "Things 3-flavoured tasks. Today is a verb, not a deadline.",
    explainer:
      "Things 3-shaped one-off work — call the dentist, plan the trip, write the post. Habits are recurring; chores are deferrable; tasks are the stuff you decide to do once. \"Today\" is a flag you set, not a date that arrives.",
    screenshot: "/screenshots/tasks.png",
    demoHref: "/demo/tasks",
    accent: SECTION_REGISTRY.tasks.color,
    highlights: [
      "Areas group long-running themes (Home, Work, Health). Projects group finite outcomes.",
      "Today is a verb — scheduled-for-today tasks land in a review block, not auto-promoted.",
      "Every mutation appends an event, so the weekly histogram of made / done / deferred is reconstructable.",
      "Inbox is implicit: any task with no area, project, schedule, or today flag.",
    ],
    howItWorks: [
      "Each task is a markdown file under Tasks/Items/{YYYY}/{MM}/{id}.md, sharded by created month.",
      "Areas live in Tasks/Areas.yaml. Projects each get their own Projects/{id}.md.",
      "Status / scheduled / today flip on the same file — filename is set at creation and never renamed.",
    ],
    keywords: [
      "things 3 alternative",
      "local task manager",
      "markdown todo app",
      "yaml task tracker",
    ],
  },
  {
    slug: "groceries",
    name: "Groceries",
    tagline: "what's low, what's stocked",
    summary: "A list of items with a low/stocked toggle. Tap when something runs out.",
    explainer:
      "Not a meal planner, not a recipe app. Just the running list of staples — flag what's low, untick what you bought. The history shows how often each item turns over.",
    screenshot: "/screenshots/groceries.png",
    demoHref: "/demo/groceries",
    accent: SECTION_REGISTRY.groceries.color,
    highlights: [
      "Two states per item: low or stocked. That's the whole UI.",
      "Bought / needed events feed a turnover history, so you can see the cadence per item.",
      "Categories (produce, dairy, household, …) group the list at a glance.",
    ],
    howItWorks: [
      "Items live in Groceries/groceries.yaml as a flat list with category + emoji.",
      "Toggling low/stocked appends an event to Groceries/Log/ — same pattern as chores and habits.",
    ],
    keywords: [
      "grocery list app",
      "local pantry tracker",
      "shopping list yaml",
    ],
  },
  {
    slug: "sleep",
    name: "Sleep",
    tagline: "from Oura",
    summary: "Sleep score, stages, HRV, resting heart rate. Read from Oura.",
    explainer:
      "Sleep score, stages, HRV, resting heart rate, time in bed. Read-only. Septena is not trying to be a sleep tracker. It puts the data I already have next to the rest of what I track.",
    screenshot: "/screenshots/sleep.png",
    demoHref: "/demo/sleep",
    accent: SECTION_REGISTRY.sleep.color,
    highlights: [
      "Pulls from the Oura API. Nothing to type in.",
      "Sits next to Nutrition and Caffeine in the same UI, which is the point.",
      "Read-only. If the wearable is wrong, fix it there.",
    ],
    howItWorks: [
      "The backend hits Oura's sleep and daily_sleep endpoints and caches locally.",
      "Credentials live outside the repo. There is no cloud component in between.",
    ],
    keywords: ["oura dashboard", "self-hosted sleep tracker", "hrv dashboard"],
  },
  {
    slug: "body",
    name: "Body",
    tagline: "from Withings",
    summary: "Weight and body fat from the scale. Shown as a trend.",
    explainer:
      "Weight and body fat, pulled from the scale. Nothing to type in. Most days I do not look; when I do, I want the trend, not yesterday's number.",
    screenshot: "/screenshots/body.png",
    demoHref: "/demo/body",
    accent: SECTION_REGISTRY.body.color,
    highlights: [
      "Withings API. Read-only.",
      "Trend view is the default. Yesterday's number is secondary.",
    ],
    howItWorks: [
      "The backend fetches the weight and body-fat series from Withings. The frontend plots the trend.",
    ],
    keywords: ["withings dashboard", "weight trend tracker", "body fat log"],
  },
  {
    slug: "health",
    name: "Health",
    tagline: "from Apple Health Auto Export",
    summary: "Steps, active energy, VO₂ max, cardio recovery. Whatever the watch captures.",
    explainer:
      "Steps, active energy, exercise minutes, VO₂ max, cardio recovery, respiratory rate. Whatever my watch captures, aggregated daily.",
    screenshot: "/screenshots/health.png",
    demoHref: "/demo/health",
    accent: SECTION_REGISTRY.health.color,
    highlights: [
      "Reads a Health Auto Export drop. No HealthKit integration and no phone required at runtime.",
      "Daily aggregates. Sums for steps and energy, latest-per-day for episodic metrics like HRV.",
      "Good for a second opinion on how the week actually went.",
    ],
    howItWorks: [
      "Health Auto Export writes a JSON snapshot to ~/.config/openclaw/health_auto_export/latest.json.",
      "The backend aggregates per-metric into daily rows. Sum, latest, or average depending on the metric.",
    ],
    keywords: ["apple health dashboard", "health auto export viewer", "vo2 max tracker"],
  },
  {
    slug: "insights",
    name: "Insights",
    tagline: "cross-section patterns",
    summary: "Does late caffeine cost you sleep? The point of having it all in one place.",
    explainer:
      "The point of having everything in one place. Does caffeine after 14:00 cost me sleep? Do heavy leg days move weight? Still early. Correlations get trustworthy around ninety days of data.",
    screenshot: "/screenshots/insights.png",
    demoHref: "/demo/insights",
    accent: SECTION_REGISTRY.correlations.color,
    highlights: [
      "Cross-section correlations: caffeine and sleep, training volume and HRV, meal timing and weight.",
      "Correlations appear only once there is enough data to stand behind them.",
      "If none of this tells you anything useful, you can stop logging.",
    ],
    howItWorks: [
      "Runs over the same YAML files the rest of the app writes. No extra data pipeline.",
      "Each correlation is labeled with its sample size.",
    ],
    keywords: ["personal analytics", "quantified self correlations", "life log insights"],
  },
];

export function getMarketingSection(slug: string): MarketingSection | undefined {
  return MARKETING_SECTIONS.find((s) => s.slug === slug);
}
