import type { Metadata } from "next";
import { OverviewDashboard } from "@/components/overview-dashboard";

export const metadata: Metadata = {
  title: { absolute: "Septena" },
};

export default function SeptenaLauncher() {
  return <OverviewDashboard />;
}
