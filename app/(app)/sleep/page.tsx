import dynamic from "next/dynamic";

const SleepDashboard = dynamic(() => import("@/components/sleep-dashboard").then(m => m.SleepDashboard));

export default function SleepPage() {
  return <SleepDashboard />;
}
