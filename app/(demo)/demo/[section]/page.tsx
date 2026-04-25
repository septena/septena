import dynamic from "next/dynamic";
import Link from "next/link";

const TrainingDashboard    = dynamic(() => import("@/components/training-dashboard").then((m) => m.TrainingDashboard));
const NutritionDashboard   = dynamic(() => import("@/components/nutrition-dashboard").then((m) => m.NutritionDashboard));
const HabitsDashboard      = dynamic(() => import("@/components/habits-dashboard").then((m) => m.HabitsDashboard));
const ChoresDashboard      = dynamic(() => import("@/components/chores-dashboard").then((m) => m.ChoresDashboard));
const SupplementsDashboard = dynamic(() => import("@/components/supplements-dashboard").then((m) => m.SupplementsDashboard));
const CaffeineDashboard    = dynamic(() => import("@/components/caffeine-dashboard").then((m) => m.CaffeineDashboard));
const CannabisDashboard    = dynamic(() => import("@/components/cannabis-dashboard").then((m) => m.CannabisDashboard));
const GroceriesDashboard   = dynamic(() => import("@/components/groceries-dashboard").then((m) => m.GroceriesDashboard));
const GutDashboard         = dynamic(() => import("@/components/gut-dashboard").then((m) => m.GutDashboard));
const AirDashboard         = dynamic(() => import("@/components/air-dashboard").then((m) => m.AirDashboard));
const HealthDashboard      = dynamic(() => import("@/components/health-dashboard").then((m) => m.HealthDashboard));
const SleepDashboard       = dynamic(() => import("@/components/sleep-dashboard").then((m) => m.SleepDashboard));
const BodyDashboard        = dynamic(() => import("@/components/body-dashboard").then((m) => m.BodyDashboard));
const TimelineDashboard    = dynamic(() => import("@/components/timeline-dashboard").then((m) => m.TimelineDashboard));
const NextDashboard        = dynamic(() => import("@/components/next-dashboard").then((m) => m.NextDashboard));
const InsightsDashboard    = dynamic(() => import("@/components/insights-dashboard").then((m) => m.InsightsDashboard));
const SettingsDashboard    = dynamic(() => import("@/components/settings-dashboard").then((m) => m.SettingsDashboard));

const WIRED: Record<string, React.ComponentType> = {
  exercise:    TrainingDashboard,
  training:    TrainingDashboard,
  nutrition:   NutritionDashboard,
  habits:      HabitsDashboard,
  chores:      ChoresDashboard,
  supplements: SupplementsDashboard,
  caffeine:    CaffeineDashboard,
  cannabis:    CannabisDashboard,
  groceries:   GroceriesDashboard,
  gut:         GutDashboard,
  air:         AirDashboard,
  health:      HealthDashboard,
  sleep:       SleepDashboard,
  body:        BodyDashboard,
  timeline:    TimelineDashboard,
  next:        NextDashboard,
  insights:    InsightsDashboard,
  settings:    SettingsDashboard,
};

export default async function DemoSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const Wired = WIRED[section];
  if (Wired) return <Wired />;
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-24 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">
        {section} demo coming soon
      </h1>
      <p className="mt-4 text-muted-foreground">
        A read-only walkthrough of the {section} section with fake data. Not built yet.
      </p>
      <Link
        href="/demo"
        className="mt-8 inline-flex items-center rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-brand-accent hover:text-brand-accent"
      >
        ← Back to home
      </Link>
    </main>
  );
}
