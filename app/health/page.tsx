import dynamic from "next/dynamic";

const HealthDashboard = dynamic(() => import("@/components/health-dashboard").then(m => m.HealthDashboard));

export default function HealthPage() {
  return <HealthDashboard />;
}
