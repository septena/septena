import type { NextConfig } from "next";

const BACKEND_URL = process.env.SEPTENA_BACKEND_URL ?? "http://127.0.0.1:7000";

// Comma-separated hostnames allowed by Next.js in dev. Default is just
// localhost — set SEPTENA_DEV_ORIGINS in .env.local to include your LAN
// hostname, Tailscale IP, or `*.ts.net` for phone access.
const DEV_ORIGINS = (process.env.SEPTENA_DEV_ORIGINS ?? "localhost")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: DEV_ORIGINS,
  // Lets the screenshot pipeline run a second `next dev` against the demo
  // vault in parallel with the user's main dev server at :7777 — each
  // server gets its own build output dir (and thus its own `dev/lock`).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  async redirects() {
    const onVercel = !!process.env.VERCEL;
    // Local dev: set SEPTENA_SHOW_MARKETING=1 in .env.local to preview the
    // marketing site at `/` as it would appear on Vercel — skips the `/` →
    // `/septena` redirect and bounces `/septena/*` to `/demo/*` like prod.
    const previewMarketing = process.env.SEPTENA_SHOW_MARKETING === "1";
    const base = [
      // Legacy /exercise and /training URLs always land on the new /septena/training path.
      { source: "/exercise", destination: "/septena/training", permanent: false },
      { source: "/exercise/:path*", destination: "/septena/training/:path*", permanent: false },
      { source: "/training", destination: "/septena/training", permanent: false },
      { source: "/training/:path*", destination: "/septena/training/:path*", permanent: false },
      { source: "/septena/exercise", destination: "/septena/training", permanent: false },
      { source: "/septena/exercise/:path*", destination: "/septena/training/:path*", permanent: false },
      { source: "/septena/settings/exercise", destination: "/septena/settings/training", permanent: false },
      { source: "/demo/exercise", destination: "/demo/training", permanent: false },
    ];
    if (onVercel || previewMarketing) {
      // Vercel has no Python backend / YAML vault — /septena/* can't render
      // real data there, so bounce to the demo.
      return [
        ...base,
        { source: "/septena", destination: "/demo", permanent: false },
        { source: "/septena/:path*", destination: "/demo/:path*", permanent: false },
      ];
    }
    // Local / self-hosted: owner wants to land directly in the app.
    return [
      ...base,
      { source: "/", destination: "/septena", permanent: false },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
