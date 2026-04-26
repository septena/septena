import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeInitScript } from "@/components/theme-init-script";
import { SWRProvider } from "@/components/swr-provider";
import { LoadTimeProvider } from "@/components/load-timer";
import { Toaster } from "@/components/ui/toaster";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

export const dynamic = "force-dynamic";

const fraunces = localFont({
  src: "./fonts/fraunces-latin.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-heading",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-sans",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  weight: "100 800",
  display: "swap",
  variable: "--font-mono",
  fallback: ["Menlo", "Monaco", "monospace"],
});

const DESCRIPTION =
  "A local-first personal health command center. Training, nutrition, habits, sleep, and vitals — stored as plain YAML on your disk, ready for any AI agent you trust.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Septena — local-first personal health command center",
    template: "%s · Septena",
  },
  description: DESCRIPTION,
  keywords: [
    "local-first health tracker",
    "yaml health log",
    "personal health dashboard",
    "bring your own agent",
    "self-hosted life tracker",
    "quantified self",
    "markdown habit tracker",
    "oura dashboard",
    "withings dashboard",
    "apple health auto export",
  ],
  applicationName: "Septena",
  authors: [{ name: "Michell Zappa" }],
  creator: "Michell Zappa",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Septena" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Septena",
    title: "Septena — local-first personal health command center",
    description: DESCRIPTION,
    images: [
      {
        url: "/screenshots/overview.png",
        width: 2400,
        height: 1500,
        alt: "Septena overview — one tile per section showing today's state.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Septena — local-first personal health command center",
    description: DESCRIPTION,
    images: ["/screenshots/overview.png"],
  },
  alternates: { canonical: "/" },
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
    <html lang="en-GB" className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
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
