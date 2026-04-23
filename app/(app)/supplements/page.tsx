import dynamic from "next/dynamic";

const SupplementsDashboard = dynamic(() => import("@/components/supplements-dashboard").then(m => m.SupplementsDashboard));

export default function SupplementsPage() {
  return (
    <div style={{ overflowX: "hidden", maxWidth: "100vw" }}>
      <SupplementsDashboard />
    </div>
  );
}
