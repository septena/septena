import Script from "next/script";
import { SectionTabs } from "@/components/section-tabs";
// Note: demo mode is no longer signalled via a window flag set by a
// `beforeInteractive` Script — that strategy is only honored in the root
// layout, so the flag arrived after the first SWR fetches and the demo
// flashed blank. lib/api.ts now detects demo synchronously from the URL.
import { SectionHeader } from "@/components/section-header";
import { SectionThemeRoot } from "@/components/section-theme";
import { SectionStatusBarAuto } from "@/components/section-status-bar";
import { ShellMain } from "@/components/shell-main";
import { PageHeaderContextProvider } from "@/components/page-header-context";
import { DemoBanner } from "@/components/demo-banner";

/** Demo route group. lib/api.ts detects demo from the URL pathname and
 *  short-circuits into fixture data; this layout re-uses the real app
 *  shell (tabs, theme, header) so every dashboard looks identical to its
 *  live counterpart. The shell deliberately skips OnboardingGate,
 *  BackendStatusBanner, PullToRefresh, and MobileHomeFab — none of them
 *  have anything useful to say when the "backend" is a synchronous fixture
 *  module in the browser. */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        defer
        data-domain="septena.app"
        src="https://plausible.io/js/script.js"
      />
      <SectionThemeRoot>
        <DemoBanner />
        <SectionTabs />
        <SectionHeader />
        <PageHeaderContextProvider>
          <ShellMain>{children}</ShellMain>
          <SectionStatusBarAuto />
        </PageHeaderContextProvider>
      </SectionThemeRoot>
    </>
  );
}
