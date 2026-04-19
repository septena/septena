import type { NextConfig } from "next";

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
