// Type shim for the optional local-only overlay module. The real file is
// gitignored (`*.local.tsx`); when absent, next.config.ts aliases this
// import to `false`, so callers must treat EXTRA_MINIS as possibly-
// undefined and fall back to {}.
declare module "@/components/overview-minis.local" {
  import type React from "react";
  export const EXTRA_MINIS: Record<string, React.FC> | undefined;
}
