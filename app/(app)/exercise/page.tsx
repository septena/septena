import dynamic from "next/dynamic";

const TrainingDashboard = dynamic(() => import("@/components/training-dashboard").then(m => m.TrainingDashboard));

export default function Home() {
  return <TrainingDashboard />;
}
