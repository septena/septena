import dynamic from "next/dynamic";

const SettingsDashboard = dynamic(() =>
  import("@/components/settings-dashboard").then((m) => m.SettingsDashboard),
);

export default function SettingsPage() {
  return <SettingsDashboard />;
}
