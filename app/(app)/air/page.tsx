import dynamic from "next/dynamic";

const AirDashboard = dynamic(() => import("@/components/air-dashboard").then(m => m.AirDashboard));

export default function AirPage() {
  return <AirDashboard />;
}
