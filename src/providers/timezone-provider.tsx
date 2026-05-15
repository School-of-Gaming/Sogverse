"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getCookie, setCookie } from "@/lib/cookies";
import { isValidTimezone, TIMEZONE_COOKIE_NAME } from "@/lib/timezone";

/**
 * Source of truth for the viewer's IANA timezone. Unlike locale / currency
 * (preferences tied to the user's profile), timezone is *environmental* —
 * it follows the device. A Helsinki-based parent opening the dashboard
 * from a Stockholm hotel should see Stockholm time. So this provider is
 * cookie-only: no profile column, no PATCH route, no auth interaction.
 *
 * Flow:
 *  1. SSR reads the `timezone` cookie (validated against `Intl`'s accepted
 *     zones) and passes it in as `initialTimezone`. If the cookie is
 *     missing or malformed, the resolver in `src/lib/timezone.ts` falls
 *     back to `DEFAULT_TIMEZONE`.
 *  2. The first client render uses `initialTimezone` verbatim — matches
 *     SSR HTML, so React doesn't log a hydration warning.
 *  3. A post-mount `useEffect` asks the browser what zone it's really in
 *     (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and, if it
 *     disagrees with what SSR used, updates the cookie and the context
 *     value. The subsequent render is a normal state update — no
 *     hydration involved.
 *  4. `visibilitychange` re-runs the detect step so a long-lived tab that
 *     was backgrounded while the user crossed a zone picks up the change
 *     the next time it's looked at.
 *
 * First-ever visit is the only path that ever flashes: server falls back
 * to Helsinki, client mounts and reports (say) America/New_York, the
 * provider re-renders with the corrected zone. Subsequent visits SSR
 * correctly from the cookie. For the bulk of the user base (Helsinki),
 * even the first visit matches.
 */

interface TimezoneContextValue {
  timezone: string;
}

const TimezoneContext = createContext<TimezoneContextValue | undefined>(
  undefined,
);

interface TimezoneProviderProps {
  initialTimezone: string;
  children: ReactNode;
}

export function TimezoneProvider({
  initialTimezone,
  children,
}: TimezoneProviderProps) {
  const [timezone, setTimezone] = useState<string>(initialTimezone);
  // Avoid rewriting the cookie on every visibility tick — only when the
  // browser-detected zone actually differs from the last thing we wrote.
  const lastWrittenCookie = useRef<string>(initialTimezone);

  useEffect(() => {
    function detectAndSync() {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!isValidTimezone(detected)) return;
      // If the cookie already says what the browser says (e.g. SSR seeded
      // from this exact cookie), skip the write — and avoid the no-op
      // setState that would otherwise re-render the whole subtree.
      const cookieValue = getCookie(TIMEZONE_COOKIE_NAME);
      if (cookieValue === detected && lastWrittenCookie.current === detected) {
        return;
      }
      if (cookieValue !== detected) {
        setCookie(TIMEZONE_COOKIE_NAME, detected);
        lastWrittenCookie.current = detected;
      }
      setTimezone(detected);
    }
    detectAndSync();
    const onVis = () => {
      if (document.visibilityState === "visible") detectAndSync();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <TimezoneContext.Provider value={{ timezone }}>
      {children}
    </TimezoneContext.Provider>
  );
}

export function useTimezone(): string {
  const ctx = useContext(TimezoneContext);
  if (ctx === undefined) {
    throw new Error("useTimezone must be used within a TimezoneProvider");
  }
  return ctx.timezone;
}
