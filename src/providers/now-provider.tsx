"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * 30s cadence matches `useGroupsWithVoice` and the prior per-component
 * tickers in the Sessions section — both sides of the app advance their
 * clocks on the same beat.
 */
const TICK_MS = 30_000;

/**
 * Single render-time clock for client components that need to derive a
 * countdown or a "live now?" flag without each maintaining their own
 * `useState + setInterval` pair.
 *
 * Seeded from the server's `new Date()` at request time so the SSR HTML
 * and the first client render produce identical output (no hydration
 * mismatch). After mount, the tick replaces it with the client's real
 * clock. The handoff lag is bounded by `TICK_MS`; the server↔client clock
 * skew between SSR and hydration is typically ~100ms and is well inside
 * the precision of every consumer (session-window math has ±5min slack,
 * countdown text is minute-precision).
 *
 * Not a stand-in for `new Date()` in non-render code (API routes, RPCs,
 * cron). Those keep using the server's wall clock — `useNow` only exists
 * to feed React renders without per-component clock state.
 */

const NowContext = createContext<Date | undefined>(undefined);

interface NowProviderProps {
  initialNow: Date;
  children: ReactNode;
}

export function NowProvider({ initialNow, children }: NowProviderProps) {
  const [now, setNow] = useState<Date>(initialNow);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
}

export function useNow(): Date {
  const ctx = useContext(NowContext);
  if (ctx === undefined) {
    throw new Error("useNow must be used within a NowProvider");
  }
  return ctx;
}
