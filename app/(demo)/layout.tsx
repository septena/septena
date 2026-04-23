import Script from "next/script";
import { SectionTabs } from "@/components/section-tabs";
import { SectionHeader } from "@/components/section-header";
import { SectionThemeRoot } from "@/components/section-theme";
import { SectionStatusBarAuto } from "@/components/section-status-bar";
import { ShellMain } from "@/components/shell-main";
import { PageHeaderContextProvider } from "@/components/page-header-context";

/** Demo route group. Sets a global flag so lib/api.ts short-circuits into
 *  fixture data, and re-uses the real app shell (tabs, theme, header) so
 *  every dashboard looks identical to its live counterpart. The shell
 *  deliberately skips OnboardingGate, BackendStatusBanner, PullToRefresh,
 *  and MobileHomeFab — none of them have anything useful to say when the
 *  "backend" is a synchronous fixture module in the browser. */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script id="septena-demo-boot" strategy="beforeInteractive">
        {`window.__SEPTENA_DEMO__=true;`}
      </Script>
      <SectionThemeRoot>
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
