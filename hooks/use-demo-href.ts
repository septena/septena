"use client";

import { usePathname } from "next/navigation";

/** In demo mode, prefix in-app paths with /demo so links don't exit the
 *  fixture sandbox. Home ("/" or "/septena") maps to "/demo". External
 *  paths (http…) and already-prefixed paths pass through. */
export function useDemoHref(): (path: string) => string {
  const pathname = usePathname();
  const demo = pathname === "/demo" || pathname.startsWith("/demo/");
  return (path: string) => {
    if (!demo) return path;
    if (!path.startsWith("/")) return path;
    if (path === "/demo" || path.startsWith("/demo/")) return path;
    if (path === "/" || path === "/septena") return "/demo";
    return `/demo${path}`;
  };
}
