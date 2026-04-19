import { cn } from "@/lib/utils";

// Inline save button + status row used at the bottom of settings forms.
// Optional `color` paints the button (per-section settings use the section
// color). Without one, falls back to the app's foreground pill.
export function SaveRow({
  saving,
  saved,
  color,
  onSave,
}: {
  saving: boolean;
  saved: boolean;
  color?: string;
  onSave: () => void;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className={cn(
          "rounded-xl px-5 py-2 text-sm font-semibold shadow-sm disabled:opacity-50",
          color ? "text-white" : "bg-foreground text-background",
        )}
        style={color ? { backgroundColor: color } : undefined}
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <p className="text-right text-xs text-muted-foreground">
        {saved ? "Saved." : "Writes to Obsidian on save."}
      </p>
    </div>
  );
}
