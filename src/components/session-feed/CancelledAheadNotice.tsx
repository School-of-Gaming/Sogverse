"use client";

import type { ReactNode } from "react";
import { CalendarX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { useTimezone } from "@/providers";
import { formatDate } from "@/lib/utils";

/**
 * How many dates the notice lists by name before it counts the rest. Three
 * reads as one sentence on a phone in every locale; a run cancelled wholesale
 * names its first date and says how many more.
 */
const LISTED_DATES = 3;

/**
 * The cancelled sessions a My SOG card passes over before its next session, as
 * a state message at the top of the card — "**Tue 29 Sep** is cancelled."
 *
 * **A warning panel, because missing it costs a family a wasted evening.** The
 * card's schedule line goes on claiming the cancelled date, so a parent who
 * reads the card the way they always have would turn up for a session that is
 * not running; the notice has to be the first thing read, not a footnote under
 * the schedule. It is the kit's status panel in the warning tone, wearing the
 * calendar-cross the session feeds mark a cancelled date with rather than the
 * warning triangle — a triangle says only "careful", and one mark for a
 * cancellation on every surface is what lets a reader recognise it — with the
 * dates carried in bold, since the date is the one thing a reader has to take
 * away. It carries no reason, which is
 * admin-only. The dates are session starts, so they are stated in the viewer's
 * zone, the same way the Join names the next one.
 *
 * **It sits first in the card body, and that is safe only because it arrives
 * with the card.** The cancelled dates travel in the same read as the rest of
 * the card's facts, so the panel is on the first paint or never; a source that
 * resolved later would shove every row beneath it down mid-read.
 *
 * Renders nothing when there is nothing cancelled ahead, so a card carries the
 * panel only while the state is.
 */
export function CancelledAheadNotice({ starts }: { starts: readonly Date[] }) {
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
  const b = (chunks: ReactNode) => (
    <strong className="font-semibold">{chunks}</strong>
  );
  const text =
    dates.length <= LISTED_DATES
      ? c.rich("cancelledAhead", {
          count: dates.length,
          dates: new Intl.ListFormat(locale, { type: "conjunction" }).format(
            dates,
          ),
          b,
        })
      : c.rich("cancelledAheadMore", {
          first: dates[0],
          more: dates.length - 1,
          b,
        });

  return (
    // `status` rather than the panel's default `alert`: the notice is on the
    // card from its first paint, and a page of cards each interrupting a screen
    // reader as it loads would bury the one it is about.
    <Alert variant="warning" role="status" icon={CalendarX}>
      <p className="min-w-0 tabular-nums">{text}</p>
    </Alert>
  );
}
