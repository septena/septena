import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

const BACKEND_URL = process.env.SETLIST_BACKEND_URL ?? "http://127.0.0.1:4445";

// Comma-separated hostnames allowed by Next.js in dev. Default is just
// localhost — set SETLIST_DEV_ORIGINS in .env.local to include your LAN
// hostname, Tailscale IP, or `*.ts.net` for phone access.
const DEV_ORIGINS = (process.env.SETLIST_DEV_ORIGINS ?? "localhost")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: DEV_ORIGINS,
  // Lets the screenshot pipeline run a second `next dev` against the demo
  // vault in parallel with the user's main dev server at :4444 — each
  // server gets its own build output dir (and thus its own `dev/lock`).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
  // Optional local-only overlay modules (gitignored `*.local.tsx`). When a
  // listed overlay file is absent, alias its import to an empty placeholder
  // module so the bundler resolves cleanly instead of failing the build.
  turbopack: (() => {
    const optional = ["components/overview-minis.local"];
    const emptyAbs = path.resolve(__dirname, "components/_empty-module.ts");
    const resolveAlias: Record<string, string> = {};
    for (const rel of optional) {
      const abs = path.resolve(__dirname, rel);
      const exists = [".tsx", ".ts"].some((ext) => fs.existsSync(abs + ext));
      if (!exists) {
        resolveAlias[`@/${rel}`] = emptyAbs;
      }
    }
    return { resolveAlias };
  })(),
};

export default nextConfig;
