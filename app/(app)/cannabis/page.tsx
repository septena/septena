import { Suspense } from "react";
import dynamic from "next/dynamic";

const CannabisDashboard = dynamic(() => import("@/components/cannabis-dashboard").then(m => m.CannabisDashboard));

export default function CannabisPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
      <CannabisDashboard />
    </Suspense>
  );
}
