import dynamic from "next/dynamic";

const CalendarDashboard = dynamic(() => import("@/components/calendar-dashboard").then(m => m.CalendarDashboard));

export default function CalendarPage() {
  return <CalendarDashboard />;
}
