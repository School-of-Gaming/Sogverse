"use client";

import { formatCountdown } from "@/lib/enrollment";

/** Highlight threshold: sessions within 12 hours get warning color */
const HIGHLIGHT_MINUTES = 720;

interface NextSessionProps {
  nextSessionStart: Date;
  locale: string;
}

/**
 * Displays "Next session Thu, Mar 5, 7:00 PM (starts in 3 hours)"
 * with warning color when the session is within 12 hours.
 */
export function NextSession({ nextSessionStart, locale }: NextSessionProps) {
  // eslint-disable-next-line react-hooks/purity -- recomputes on parent re-render (e.g. voice page polls every 30s)
  const now = Date.now();
  const msUntil = nextSessionStart.getTime() - now;
  const totalMinutes = Math.max(0, Math.floor(msUntil / 60_000));
  const countdown = msUntil > 0 ? formatCountdown(msUntil) : null;

  return (
    <p className="text-sm">
      Next session{" "}
      {nextSessionStart.toLocaleDateString(locale, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}
      {countdown && (
        <span
          className={
            totalMinutes < HIGHLIGHT_MINUTES
              ? "font-medium text-primary"
              : "text-muted-foreground"
          }
        >
          {" "}
          (starts in {countdown})
        </span>
      )}
    </p>
  );
}
