// Section registry — single source of truth for nav, API paths, and theming.
// Adding a new section means: add an entry here, create app/{path}/page.tsx,
// and mount an APIRouter in main.py at apiBase.

export type SectionKey = "exercise" | "nutrition" | "habits" | "chores" | "groceries" | "supplements" | "cannabis" | "caffeine" | "health" | "sleep" | "body" | "weather" | "calendar" | "air" | "correlations";

export type Section = {
  key: SectionKey;
  label: string;
  path: string;
  apiBase: string;
  obsidianDir: string;
  // HSL accent — used for active tab pill, chart lines, CTAs.
  color: string;
  // Short pitch shown on the root launcher card.
  tagline: string;
  // Decorative glyph shown in the per-page header ({emoji} {label}). Also
  // used on the section's settings card. Empty string renders nothing.
  emoji: string;
};

export const SECTIONS: Record<SectionKey, Section> = {
  exercise: {
    key: "exercise",
    label: "Exercise",
    path: "/exercise",
    apiBase: "/api",
    obsidianDir: "Bases/Exercise/Log",
    // Matches tailwind `bg-orange-500` exactly so inline styles and utility
    // classes render identically (see EXERCISE_SHADES below).
    color: "hsl(25,95%,53%)",
    tagline: "Sessions, progressions & PRs",
    emoji: "🏋️",
  },
  nutrition: {
    key: "nutrition",
    label: "Nutrition",
    path: "/nutrition",
    apiBase: "/api/nutrition",
    obsidianDir: "Bases/Nutrition/Log",
    color: "hsl(45,90%,48%)",
    tagline: "Meals, macros & fasting",
    emoji: "🍱",
  },
  habits: {
    key: "habits",
    label: "Habits",
    path: "/habits",
    apiBase: "/api/habits",
    obsidianDir: "Bases/Habits/Log",
    color: "hsl(220,60%,55%)",
    tagline: "Morning, afternoon & evening routines",
    emoji: "✅",
  },
  chores: {
    key: "chores",
    label: "Chores",
    path: "/chores",
    apiBase: "/api/chores",
    obsidianDir: "Bases/Chores/Log",
    color: "hsl(200,45%,50%)",
    tagline: "Recurring tasks, deferrable",
    emoji: "🧹",
  },
  groceries: {
    key: "groceries",
    label: "Groceries",
    path: "/groceries",
    apiBase: "/api/groceries",
    obsidianDir: "Bases/Groceries",
    color: "hsl(142,55%,38%)",
    tagline: "Smart grocery checklist",
    emoji: "🛒",
  },
  supplements: {
    key: "supplements",
    label: "Supplements",
    path: "/supplements",
    apiBase: "/api/supplements",
    obsidianDir: "Bases/Supplements/Log",
    color: "hsl(340,70%,50%)",
    tagline: "Daily stack & streaks",
    emoji: "💊",
  },
  cannabis: {
    key: "cannabis",
    label: "Cannabis",
    path: "/cannabis",
    apiBase: "/api/cannabis",
    obsidianDir: "Bases/Cannabis/Log",
    color: "hsl(145,55%,38%)",
    tagline: "Log sessions, strains & usage",
    emoji: "🌿",
  },
  caffeine: {
    key: "caffeine",
    label: "Caffeine",
    path: "/caffeine",
    apiBase: "/api/caffeine",
    obsidianDir: "Bases/Caffeine/Log",
    color: "hsl(22,55%,32%)",
    tagline: "V60s, matcha & time of day",
    emoji: "☕",
  },
  health: {
    key: "health",
    label: "Health",
    path: "/health",
    apiBase: "/api/health",
    obsidianDir: "",
    color: "hsl(270,60%,55%)",
    tagline: "HRV, weight & vitals",
    emoji: "💓",
  },
  sleep: {
    key: "sleep",
    label: "Sleep",
    path: "/sleep",
    apiBase: "/api/health",
    obsidianDir: "",
    color: "hsl(245,55%,60%)",
    tagline: "Score, stages & trends",
    emoji: "🌙",
  },
  body: {
    key: "body",
    label: "Body",
    path: "/body",
    apiBase: "/api/health",
    obsidianDir: "",
    color: "hsl(170,50%,42%)",
    tagline: "Weight, body fat & trends",
    emoji: "⚖️",
  },
  weather: {
    key: "weather",
    label: "Weather",
    path: "/weather",
    apiBase: "/api/weather",
    obsidianDir: "",
    color: "hsl(205,75%,50%)",
    tagline: "Today's conditions & forecast",
    emoji: "☀️",
  },
  air: {
    key: "air",
    label: "Air",
    path: "/air",
    apiBase: "/api/air",
    obsidianDir: "Bases/Air/Log",
    color: "hsl(190,70%,45%)",
    tagline: "CO₂, temperature & humidity",
    emoji: "🌬️",
  },
  calendar: {
    key: "calendar",
    label: "Calendar",
    path: "/calendar",
    apiBase: "/api/calendar",
    obsidianDir: "",
    color: "hsl(290,55%,55%)",
    tagline: "Today's events at a glance",
    emoji: "📅",
  },
  correlations: {
    key: "correlations",
    label: "Insights",
    path: "/insights",
    apiBase: "",
    obsidianDir: "",
    color: "hsl(220,8%,55%)",
    tagline: "Cross-section patterns",
    emoji: "🔗",
  },
};

export const SECTION_LIST: Section[] = Object.values(SECTIONS);

/** Sections shown in chrome (topnav pills, mobile home FAB menu). Excludes
 *  meta pages like "correlations" that live on the homepage bottom action
 *  row instead. Single source of truth for nav parity — if it belongs in
 *  the topnav, it belongs in the FAB menu, and vice versa. */
export const NAV_SECTION_LIST: Section[] = SECTION_LIST.filter(
  (s) => s.key !== "correlations",
);

/** Canonical three-shade orange palette for the exercise section.
 *
 *  The exercise section has three modalities (strength, cardio, mobility/
 *  yoga) that need to be visually distinguishable without leaving the
 *  section's orange accent. These values are aligned to tailwind's
 *  orange-500/400/300 scale, so an inline `style={{ color: EXERCISE_SHADES.
 *  cardio }}` renders identically to a `bg-orange-400` utility class. This
 *  is the single source of truth — the week-streak dots, the training-
 *  dashboard chart line, the homepage week strip, and the cardio chart all
 *  import from here. Do not redefine these inline. */
export const EXERCISE_SHADES = {
  /** Strength — tailwind orange-500 / `#f97316`. Section accent. */
  strength: "hsl(25,95%,53%)",
  /** Cardio — tailwind orange-400 / `#fb923c`. One step lighter. */
  cardio: "hsl(27,96%,61%)",
  /** Mobility / yoga — tailwind orange-300 / `#fdba74`. Softest. */
  mobility: "hsl(31,97%,72%)",
} as const;
