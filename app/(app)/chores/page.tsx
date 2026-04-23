import dynamic from "next/dynamic";

const ChoresDashboard = dynamic(() => import("@/components/chores-dashboard").then(m => m.ChoresDashboard));

export default function ChoresPage() {
  return (
    <div style={{ overflowX: "hidden", maxWidth: "100vw" }}>
      <ChoresDashboard />
    </div>
  );
}
