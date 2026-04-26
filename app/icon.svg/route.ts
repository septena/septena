// Static favicon / apple-touch-icon — the seven-circle Septena mark.

export const dynamic = "force-static";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <style>
    .bg { fill: #ffffff; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: #0a0a0a; }
    }
  </style>
  <rect class="bg" width="512" height="512" rx="108"/>
  <g transform="translate(256 256) scale(0.95) translate(-256 -256)">
    <circle cx="256" cy="107" r="49" fill="#ef4444"/>
    <circle cx="373" cy="162" r="49" fill="#f97316"/>
    <circle cx="402" cy="290" r="49" fill="#eab308"/>
    <circle cx="321" cy="391" r="49" fill="#22c55e"/>
    <circle cx="191" cy="391" r="49" fill="#06b6d4"/>
    <circle cx="110" cy="290" r="49" fill="#3b82f6"/>
    <circle cx="139" cy="162" r="49" fill="#8b5cf6"/>
  </g>
</svg>`;

export function GET() {
  return new Response(SVG, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
