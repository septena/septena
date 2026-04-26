// Static PWA manifest. theme_color is fixed to the Septena brand accent.

// Keep this in sync with `--brand-accent` in app/globals.css.
const THEME_COLOR = "#3b82f6";

export const dynamic = "force-static";

export function GET() {
  const manifest = {
    name: "Septena",
    short_name: "Septena",
    description: "Personal week tracker",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: THEME_COLOR,
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
