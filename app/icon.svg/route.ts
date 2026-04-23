// Dynamic favicon / apple-touch-icon. Reads `icon_color` from /api/settings
// so users can re-theme the browser tab icon and iOS home-screen icon from
// the settings page without editing files.

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

function escapeColor(c: string): string {
  // SVG fill accepts hex, rgb(), hsl(), and named colors. Strip anything
  // that could break out of the attribute to keep the response safe even
  // if a malformed value lands in settings.yaml.
  return c.replace(/[<>"']/g, "");
}

export async function GET() {
  const color = escapeColor(await loadColor());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <style>
    .bg { fill: #ffffff; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: #0a0a0a; }
    }
  </style>
  <rect class="bg" width="512" height="512" rx="108"/>
  <g fill="${color}">
    <circle cx="256" cy="141" r="34"/>
    <circle cx="346" cy="184" r="34"/>
    <circle cx="368" cy="282" r="34"/>
    <circle cx="306" cy="360" r="34"/>
    <circle cx="206" cy="360" r="34"/>
    <circle cx="144" cy="282" r="34"/>
    <circle cx="166" cy="184" r="34"/>
  </g>
</svg>`;
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store",
    },
  });
}
