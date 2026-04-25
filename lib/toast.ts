// Thin wrapper around Sonner so call sites stay decoupled from the lib.
// Swap the import in this file if we ever change toast libraries.

import { toast } from "sonner";
import { haptic } from "@/lib/haptics";

export type ToastOptions = {
  description?: string;
  duration?: number;
};

export function showToast(message: string, opts?: ToastOptions): void {
  haptic();
  toast.success(message, opts);
}

export function showError(message: string, opts?: ToastOptions): void {
  toast.error(message, opts);
}
