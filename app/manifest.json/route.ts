// Dynamic PWA manifest. Mirrors `icon_color` from /api/settings into the
// manifest's `theme_color` so the iOS home-screen icon and status bar tint
// match the favicon without a rebuild.

const BACKEND =
  process.env.SEPTENA_BACKEND_URL ??
  process.env.SETLIST_BACKEND_URL ??
  "http://127.0.0.1:4445";
const FALLBACK = "#ff6600";

export const dynamic = "force-dynamic";

async function loadColor(): Promise<string> {
  try {
    const res = await fetch(`${BACKEND}/api/settings`, { cache: "no-store" });
    if (!res.ok) return FALLBACK;
    const data = (await res.json()) as { icon_color?: unknown };
    const c = typeof data.icon_color === "string" ? data.icon_color.trim() : "";
    return c || FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export async function GET() {
  const color = await loadColor();
  const manifest = {
    name: "Septena",
    short_name: "Septena",
    description: "Personal week tracker",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: color,
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "no-store",
    },
  });
}
