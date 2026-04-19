import dynamic from "next/dynamic";

const WeatherDashboard = dynamic(() => import("@/components/weather-dashboard").then(m => m.WeatherDashboard));

export default function WeatherPage() {
  return <WeatherDashboard />;
}
