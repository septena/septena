"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  SECTION_ACCENT_SHADE_1,
  SECTION_ACCENT_SHADE_2,
  SECTION_ACCENT_SHADE_3,
  SECTION_ACCENT_SOFT,
  SECTION_ACCENT_STRONG,
} from "@/lib/section-colors";
import { haptic } from "@/lib/haptics";
import { showToast } from "@/lib/toast";

const CONFETTI_COUNT = 70;
const CONFETTI_TTL_MS = 3500;

const COLORS = [
  SECTION_ACCENT_SHADE_1,
  SECTION_ACCENT_SHADE_2,
  SECTION_ACCENT_SHADE_3,
  SECTION_ACCENT_STRONG,
  SECTION_ACCENT_SOFT,
];

type Particle = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  drift: number;
  rotate: number;
  color: string;
  size: number;
};

function makeParticles(seed: number): Particle[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id: seed * 1000 + i,
    left: Math.random() * 100,
    delay: Math.random() * 0.4,
    duration: 2.2 + Math.random() * 1.8,
    drift: (Math.random() - 0.5) * 120,
    rotate: (Math.random() - 0.5) * 720,
    color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    size: 6 + Math.random() * 8,
  }));
}

export function Confetti({ seed = 0 }: { seed?: number }) {
  const [particles] = useState<Particle[]>(() => makeParticles(seed));

  return (
    <>
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 1; }
          85%  { opacity: 1; }
          100% { transform: translate3d(var(--drift), 110vh, 0) rotate(var(--rot)); opacity: 0; }
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute block rounded-sm"
            style={{
              left: `${p.left}vw`,
              top: 0,
              width: `${p.size}px`,
              height: `${p.size * 0.4}px`,
              backgroundColor: p.color,
              animation: `confetti-fall ${p.duration}s ${p.delay}s cubic-bezier(.2,.6,.3,1) forwards`,
              ["--drift" as string]: `${p.drift}px`,
              ["--rot" as string]: `${p.rotate}deg`,
            }}
          />
        ))}
      </div>
    </>
  );
}

export function useConfettiBurst() {
  const [burstId, setBurstId] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fire = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    haptic("medium");
    setBurstId(Date.now());
    timerRef.current = setTimeout(() => {
      setBurstId(null);
      timerRef.current = null;
    }, CONFETTI_TTL_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const node = burstId !== null ? <Confetti key={burstId} seed={burstId} /> : null;
  return { fire, node };
}

/**
 * Standard celebration: always toasts, optionally fires confetti.
 *
 * Toast is the baseline acknowledgement (carries readable copy like a streak
 * count); confetti is the visual garnish gated by user setting. Call
 * `celebrate({ message, description?, confetti? })` on the same prev→next
 * transition you'd otherwise gate confetti on.
 */
export function useCelebrate() {
  const { fire, node } = useConfettiBurst();
  const celebrate = useCallback(
    (opts: { message: string; description?: string; confetti?: boolean }) => {
      showToast(opts.message, opts.description ? { description: opts.description } : undefined);
      if (opts.confetti) fire();
    },
    [fire],
  );
  return { celebrate, node };
}
