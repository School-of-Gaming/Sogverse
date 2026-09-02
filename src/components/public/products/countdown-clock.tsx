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
  className?: string;
  /** Renders the four cells but with `--` numbers, no live ticking. */
  paused?: boolean;
  /**
   * Renders the four cells with `--` placeholders and no live ticking.
   * Use when the countdown has *completed* but the slot must remain
   * occupied to preserve panel height — caller is expected to keep this
   * mounted so the surrounding layout stays put across the flip.
   */
  done?: boolean;
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
  className,
  paused,
  done,
}: CountdownClockProps) {
  const t = useTranslations("productDetail.countdown");

  // Hydration parity: render an empty shape first, then start ticking
  // after mount. Avoids "Hydration failed" when the SSR output didn't
  // know `Date.now()` and the client does. State here is *just a tick
  // counter* — the real `now` is computed inline at render so we don't
  // synchronously call setState from the effect body (anti-pattern).
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (paused || done) return;
    const id = setInterval(() => {
      setSnapshot(buildSnapshot(targetMs, Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [targetMs, paused, done]);

  // When `done`, force the cells to render `--` placeholders regardless of
  // the last live snapshot, so the visual matches the panel's "registration
  // is now open" state without unmounting (which would shrink the panel).
  const cellValue = (live: number | undefined) => (done ? undefined : live);

  return (
    <div className={cn("grid grid-cols-4 gap-1.5 text-center", className)}>
      <Cell value={cellValue(snapshot?.days)} label={t("days")} />
      <Cell value={cellValue(snapshot?.hours)} label={t("hours")} />
      <Cell value={cellValue(snapshot?.minutes)} label={t("minutes")} />
      <Cell value={cellValue(snapshot?.seconds)} label={t("seconds")} />
    </div>
  );
}

function Cell({ value, label }: { value: number | undefined; label: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 py-2">
      <p className="text-xl font-bold tabular-nums sm:text-2xl">
        {value === undefined ? "--" : pad2(value)}
      </p>
      {/* The unit words carry the family, the numerals stay the app's own ink:
          a countdown is time ahead, which is wit's word, and this is the only
          ink in the cell free to say so — the number is the value, and the
          cell's edge is furniture. Wit ink is always soft. */}
      <p className="text-[9px] uppercase tracking-wider text-yty-wit-soft">
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
 * Used by the signup panel to swap the CTA from disabled to active without
 * unmounting the form.
 *
 * `null` means "nothing to count down to" and is answered `false` without
 * starting a timer — the panel passes null once registration is open, and a
 * once-a-second re-render of a live form buys nothing there. The timer also
 * stops the moment the target is reached: for a *stable* target the answer
 * cannot change again.
 *
 * NOT latched across prop changes: a caller that reaches `done === true` and
 * then swaps `targetMs` to null sees the return value fall back to `false`.
 * The signup panel is built for that — it ORs the hook with "no longer
 * pre-open" and never feeds the raw value to anything that must stay true —
 * and any new caller must either keep the target stable for the mount or
 * compose the same way. Don't wire this hook's raw value straight into the
 * clock's `done` prop.
 *
 * Hydration parity: `now` starts unset, so the first render returns `false`
 * everywhere. The interval picks up the real time on its first tick (within
 * 1s). Same SSR-safe shape as `CountdownClock` above.
 */
export function useCountdownDone(targetMs: number | null): boolean {
  const [now, setNow] = useState<number | null>(null);

  const done = targetMs !== null && now !== null && now >= targetMs;

  useEffect(() => {
    if (targetMs === null || done) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetMs, done]);

  return done;
}
