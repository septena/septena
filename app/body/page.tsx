import dynamic from "next/dynamic";

const BodyDashboard = dynamic(() => import("@/components/body-dashboard").then(m => m.BodyDashboard));

export default function BodyPage() {
  return <BodyDashboard />;
}
