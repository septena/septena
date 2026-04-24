// Small text-free indicators for difficulty and cardio level.
// Shared building block: a row of dots, some filled. Difficulty is capped
// at 3 with a green → amber → red ramp. Level uses a signal-bar style
// (ascending height) so the glyph stays compact regardless of scale.

type PipProps = {
  filled: number;
  total: number;
  color: string;
  size?: number;
};

function Pips({ filled, total, color, size = 5 }: PipProps) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            backgroundColor: i < filled ? color : "var(--muted)",
            border: i < filled ? "none" : "1px solid var(--border)",
          }}
        />
      ))}
    </span>
  );
}

const DIFFICULTY_MAP: Record<string, { filled: number; color: string; title: string }> = {
  easy: { filled: 1, color: "#22c55e", title: "Easy" },
  medium: { filled: 2, color: "#f59e0b", title: "Medium" },
  hard: { filled: 3, color: "#ef4444", title: "Hard" },
};

export function DifficultyGlyph({ difficulty }: { difficulty: string | null | undefined }) {
  const key = (difficulty ?? "").toLowerCase();
  const entry = DIFFICULTY_MAP[key];
  if (!entry) return null;
  return (
    <span title={entry.title} className="inline-flex align-middle">
      <Pips filled={entry.filled} total={3} color={entry.color} />
    </span>
  );
}

// Signal-bar style: N bars of ascending height, lit proportional to the
// level value. Total bars = 5 (caps at L10+ = all lit). Keeps the footprint
// small and readable next to numeric stats.
export function LevelGlyph({ level, max = 10 }: { level: number | null | undefined; max?: number }) {
  if (level == null) return null;
  const BARS = 5;
  const lit = Math.min(BARS, Math.max(1, Math.round((level / max) * BARS)));
  return (
    <span
      title={`Level ${level}`}
      className="inline-flex items-end gap-0.5 align-middle"
      aria-hidden
    >
      {Array.from({ length: BARS }, (_, i) => {
        const isLit = i < lit;
        return (
          <span
            key={i}
            style={{
              width: 3,
              height: 4 + i * 2,
              borderRadius: 1,
              backgroundColor: isLit ? "var(--section-accent)" : "var(--muted)",
              border: isLit ? "none" : "1px solid var(--border)",
            }}
          />
        );
      })}
    </span>
  );
}
