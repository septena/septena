import dynamic from "next/dynamic";

const GroceriesDashboard = dynamic(() => import("@/components/groceries-dashboard").then(m => m.GroceriesDashboard));

export default function GroceriesPage() {
  return (
    <div style={{ overflowX: "hidden", maxWidth: "100vw" }}>
      <GroceriesDashboard />
    </div>
  );
}
