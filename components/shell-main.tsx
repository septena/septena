"use client";

import { usePathname } from "next/navigation";

export function ShellMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const section = pathname === "/septena" ? "overview" : pathname.split("/")[1];
  return (
    <main
      data-section={section}
      className="mx-auto min-h-screen w-full min-w-0 max-w-6xl overflow-hidden px-4 py-6 sm:px-6 lg:px-8"
    >
      {children}
    </main>
  );
}
