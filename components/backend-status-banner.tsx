"use client";

import { useEffect, useState } from "react";

/** Polls /api/stats (same-origin, through the Next.js proxy) and renders
 *  a fixed top banner whenever the FastAPI backend is unreachable. Recovery
 *  is detected automatically — the banner disappears as soon as a poll
 *  succeeds.
 *
 *  Probing through the proxy is the only thing that works on phones:
 *  hitting 127.0.0.1:4445 from a mobile browser would point at the phone,
 *  not the dev machine. The proxy turns a refused upstream into a 500, so
 *  we treat ANY non-2xx as down. /api/stats is simple enough that real 500s
 *  are unlikely — false positives here are acceptable.
 *
 *  Polls every 5s while down, every 30s while up. Pauses on hidden tabs. */
const HEALTH_URL = "/api/stats";

export function BackendStatusBanner() {
  const [down, setDown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      let isDown = false;
      // Hard timeout — the Next.js dev proxy will hang forever when the
      // upstream is dead (no response ever arrives), so without an abort
      // the probe never resolves and the banner silently stays hidden.
      const ctrl = new AbortController();
      const killer = setTimeout(() => ctrl.abort(), 3000);
      try {
        const r = await fetch(HEALTH_URL, { cache: "no-store", signal: ctrl.signal });
        isDown = !r.ok;
      } catch {
        isDown = true;
      } finally {
        clearTimeout(killer);
      }
      if (cancelled) return;
      setDown(isDown);
      const delay = isDown ? 5000 : 30000;
      timer = setTimeout(tick, delay);
    };

    tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (timer) clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!down) return null;

  return (
    <div
      role="alert"
      className="w-full max-w-full overflow-hidden bg-zinc-800 text-zinc-100 px-4 py-2 text-sm text-center shadow-sm pt-[calc(env(safe-area-inset-top)+0.5rem)]"
    >
      <span className="font-semibold">Backend offline</span>
      <span className="hidden sm:inline"> — start it with </span>
      <code className="ml-1 rounded bg-zinc-700 px-1 py-0.5 text-[11px]">
        uvicorn main:app --port 4445 --reload
      </code>
    </div>
  );
}
