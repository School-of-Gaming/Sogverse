"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Live-ticking countdown to a target instant. Renders four cells —
// days, hrs, min, sec — with tabular numerals so digits don't reflow.
//
// Uses a setInterval(1000) since users perceive sub-second drift on the
// seconds cell; rAF would be smoother but pulls in extra renders for
// no visible payoff. The interval clears on unmount and on `targetMs`
// change so a parent that swaps the target doesn't double-tick.
//
// SSR / pre-hydration: emits the same DOM shape as the live state with
// `--` placeholders, so a hydration mismatch doesn't trigger React
// warnings and the layout doesn't shift when the clock takes over.

export interface CountdownClockProps {
  /** Unix epoch ms of the moment we're counting down to. */
  targetMs: number;
  /** Set to a fixed value to render a deterministic preview snapshot. */
  fixedNowMs?: number;
  className?: string;
  /** Renders the four cells but with `--` numbers, no live ticking. */
  paused?: boolean;
}

interface Snapshot {
  done: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function CountdownClock({
  targetMs,
  fixedNowMs,
  className,
  paused,
}: CountdownClockProps) {
  const t = useTranslations("productDetail.countdown");

  // Hydration parity: render an empty shape first, then start ticking
  // after mount. Avoids "Hydration failed" when the SSR output didn't
  // know `Date.now()` and the client does. State here is *just a tick
  // counter* — the real `now` is computed inline at render so we don't
  // synchronously call setState from the effect body (anti-pattern).
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() =>
    fixedNowMs !== undefined ? buildSnapshot(targetMs, fixedNowMs) : null,
  );

  useEffect(() => {
    if (paused) return;
    if (fixedNowMs !== undefined) return;
    const id = setInterval(() => {
      setSnapshot(buildSnapshot(targetMs, Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [targetMs, paused, fixedNowMs]);

  return (
    <div className={cn("grid grid-cols-4 gap-1.5 text-center", className)}>
      <Cell value={snapshot?.days} label={t("days")} />
      <Cell value={snapshot?.hours} label={t("hours")} />
      <Cell value={snapshot?.minutes} label={t("minutes")} />
      <Cell value={snapshot?.seconds} label={t("seconds")} />
    </div>
  );
}

function Cell({ value, label }: { value: number | undefined; label: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 py-2">
      <p className="text-xl font-bold tabular-nums sm:text-2xl">
        {value === undefined ? "--" : pad2(value)}
      </p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function buildSnapshot(targetMs: number, nowMs: number): Snapshot {
  const remaining = targetMs - nowMs;
  if (remaining <= 0) {
    return { done: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const seconds = Math.floor(remaining / 1000) % 60;
  const minutes = Math.floor(remaining / (60 * 1000)) % 60;
  const hours = Math.floor(remaining / (60 * 60 * 1000)) % 24;
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  return { done: false, days, hours, minutes, seconds };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Subscribe-friendly hook for callers that need the same flip from
 * pre-open → open the clock displays. Returns true once `now >= targetMs`.
 * Used by SignupPanel to swap the CTA from disabled to active without
 * unmounting the form.
 *
 * Hydration parity: both server and client start at `targetMs - 1` so the
 * first render returns `false` everywhere. The interval refreshes `now`
 * after mount, picking up the real time on the first tick (within 1s).
 * Same SSR-safe shape as `CountdownClock` above.
 */
export function useCountdownDone(
  targetMs: number,
  fixedNowMs?: number,
): boolean {
  const [now, setNow] = useState<number>(() => fixedNowMs ?? targetMs - 1);

  useEffect(() => {
    if (fixedNowMs !== undefined) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fixedNowMs]);

  return now >= targetMs;
}
