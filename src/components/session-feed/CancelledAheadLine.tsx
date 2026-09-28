"use client";

import { CalendarX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTimezone } from "@/providers";
import { formatDate } from "@/lib/utils";

/**
 * How many dates the line lists by name before it counts the rest. Three reads
 * as one line on a phone in every locale; a run cancelled wholesale names its
 * first date and says how many more.
 */
const LISTED_DATES = 3;

/**
 * The cancelled sessions a My SOG card passes over before its next session, as
 * one quiet line — "Tue 29 Sep is cancelled".
 *
 * **Neutral, never a warning**, like the cancelled line in the feeds: a
 * cancellation is news, and nothing on the reader's side is owed about it. It
 * carries no reason, which is admin-only. The dates are session starts, so they
 * are stated in the viewer's zone, the same way the Join names the next one.
 *
 * Renders nothing when there is nothing cancelled ahead, so a card carries the
 * line only while it has something to say.
 */
export function CancelledAheadLine({ starts }: { starts: readonly Date[] }) {
  const c = useTranslations("activityCard");
  const locale = useLocale();
  const timeZone = useTimezone();

  if (starts.length === 0) return null;

  const dates = starts.map((start) =>
    formatDate(start, locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    }),
  );
  const text =
    dates.length <= LISTED_DATES
      ? c("cancelledAhead", {
          count: dates.length,
          dates: new Intl.ListFormat(locale, { type: "conjunction" }).format(
            dates,
          ),
        })
      : c("cancelledAheadMore", { first: dates[0], more: dates.length - 1 });

  return (
    <p className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
      <CalendarX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 tabular-nums">{text}</span>
    </p>
  );
}
