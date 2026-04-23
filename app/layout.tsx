import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeInitScript } from "@/components/theme-init-script";
import { SWRProvider } from "@/components/swr-provider";
import { LoadTimeProvider } from "@/components/load-timer";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Septena",
  description: "Personal week tracker — exercise, nutrition, habits, vitals.",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Septena" },
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
              {children}
              <Toaster />
            </LoadTimeProvider>
          </SWRProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
