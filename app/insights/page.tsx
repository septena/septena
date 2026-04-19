import dynamic from "next/dynamic";

const InsightsDashboard = dynamic(() => import("@/components/insights-dashboard").then(m => m.InsightsDashboard));

export default function InsightsPage() {
  return <InsightsDashboard />;
}
