import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeInitScript } from "@/components/theme-init-script";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { BackendStatusBanner } from "@/components/backend-status-banner";
import { SectionTabs } from "@/components/section-tabs";
import { SectionHeader } from "@/components/section-header";
import { MobileHomeFab } from "@/components/mobile-home-fab";
import { SWRProvider } from "@/components/swr-provider";
import { LoadTimeProvider } from "@/components/load-timer";
import { PageHeaderContextProvider } from "@/components/page-header-context";
import { Toaster } from "@/components/ui/toaster";
import { OnboardingGate } from "@/components/onboarding-gate";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Setlist",
  description: "Personal health command center — exercise, nutrition, habits, vitals.",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Setlist" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <head>
        <ThemeInitScript />
      </head>
      <body className="min-h-full bg-background text-foreground antialiased overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
        <ThemeProvider>
          <SWRProvider>
            <LoadTimeProvider>
              <BackendStatusBanner />
              <OnboardingGate>
                <SectionTabs />
                <SectionHeader />
                <PullToRefresh />
                <PageHeaderContextProvider>
                {children}
                </PageHeaderContextProvider>
                <MobileHomeFab />
              </OnboardingGate>
              <Toaster />
            </LoadTimeProvider>
          </SWRProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
