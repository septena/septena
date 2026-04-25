// Haptics shim that works on both Android (Vibration API) and iOS Safari 17.4+
// (via the documented `<input type="checkbox" switch>` system-haptic behavior).
//
// Must be called inside a user-gesture handler — iOS will not fire haptics for
// programmatic toggles outside a trusted event.

type Intensity = "light" | "medium";

let labelEl: HTMLLabelElement | null = null;
let inputEl: HTMLInputElement | null = null;

function ensureSwitch(): HTMLLabelElement | null {
  if (typeof document === "undefined") return null;
  if (labelEl && labelEl.isConnected) return labelEl;

  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);pointer-events:none;opacity:0;";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");

  label.appendChild(input);
  document.body.appendChild(label);

  labelEl = label;
  inputEl = input;
  return label;
}

export function haptic(intensity: Intensity = "light"): void {
  if (typeof window === "undefined") return;
  try {
    const nav = navigator as Navigator & {
      vibrate?: (p: number | number[]) => boolean;
    };
    if (typeof nav.vibrate === "function") {
      nav.vibrate(intensity === "medium" ? 14 : 8);
      return;
    }
    const label = ensureSwitch();
    if (label && inputEl) {
      inputEl.checked = !inputEl.checked;
      label.click();
    }
  } catch {
    // best-effort
  }
}

export default haptic;
