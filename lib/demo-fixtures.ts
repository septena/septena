/** Demo-mode fixture dispatcher.
 *
 *  When the (demo) layout sets `window.__SEPTENA_DEMO__`, `request()` in
 *  lib/api.ts routes through `matchDemoFixture()` instead of hitting the
 *  FastAPI backend. This lets the Vercel-deployed marketing+demo site reuse
 *  every real dashboard component without a running Python backend.
 *
 *  Sections get wired up incrementally — anything not matched here falls
 *  through to a generic empty shape so the dashboard renders without
 *  crashing.
 */

type FixtureHandler = (url: URL, init?: RequestInit) => unknown;

// Path pattern → handler. Order matters: first match wins. Use `:param` to
// capture a segment (accessible as `url.pathname` — handlers parse as needed).
const FIXTURES: Array<{ pattern: RegExp; handler: FixtureHandler }> = [
  // TODO: wire each section here as we build its fixtures.
];

export function matchDemoFixture(path: string, init?: RequestInit): unknown {
  const url = new URL(path, "http://demo.local");
  for (const { pattern, handler } of FIXTURES) {
    if (pattern.test(url.pathname)) {
      return handler(url, init);
    }
  }
  return emptyFallback(url);
}

/** Return shape-compatible-but-empty data for unwired endpoints. Lets
 *  dashboards render their empty states instead of throwing on undefined. */
function emptyFallback(url: URL): unknown {
  const p = url.pathname;
  if (p.endsWith("/events") || p.includes("/events?")) return { events: [] };
  if (p === "/api/config") {
    return {
      data_dir: "demo",
      health_auto_export_path: null,
      integrations: {},
      nav: { visible: [] },
    };
  }
  if (p === "/api/stats") {
    return {
      total_sessions: 0,
      total_entries: 0,
      exercises_count: 0,
      date_range: { start: null, end: null },
    };
  }
  if (p === "/api/sections") return { sections: [] };
  if (p === "/api/settings") return {};
  // Default: empty array for list-shaped endpoints, empty object otherwise.
  return Array.isArray((undefined as unknown) ?? null) ? [] : {};
}

export function isDemoMode(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as unknown as { __SEPTENA_DEMO__?: boolean }).__SEPTENA_DEMO__)
  );
}
