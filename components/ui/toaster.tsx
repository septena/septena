"use client";

import { useTheme } from "@/components/theme-provider";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={(resolvedTheme as "light" | "dark") ?? "system"}
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast: "rounded-xl border border-border bg-background text-foreground shadow-lg",
        },
      }}
    />
  );
}
