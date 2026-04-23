import { BackendStatusBanner } from "@/components/backend-status-banner";
import { SectionTabs } from "@/components/section-tabs";
import { SectionHeader } from "@/components/section-header";
import { SectionThemeRoot } from "@/components/section-theme";
import { SectionStatusBarAuto } from "@/components/section-status-bar";
import { ShellMain } from "@/components/shell-main";
import { MobileHomeFab } from "@/components/mobile-home-fab";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { PageHeaderContextProvider } from "@/components/page-header-context";
import { OnboardingGate } from "@/components/onboarding-gate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackendStatusBanner />
      <OnboardingGate>
        <SectionThemeRoot>
          <SectionTabs />
          <SectionHeader />
          <PullToRefresh />
          <PageHeaderContextProvider>
            <ShellMain>{children}</ShellMain>
            <SectionStatusBarAuto />
          </PageHeaderContextProvider>
        </SectionThemeRoot>
        <MobileHomeFab />
      </OnboardingGate>
    </>
  );
}
