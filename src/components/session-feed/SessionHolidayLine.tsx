"use client";

import { formatInTimeZone } from "date-fns-tz";
import { CalendarOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { resolveLocale } from "@/lib/constants/locales";
import { breakName } from "@/lib/holiday-breaks";
import { formatCompactDateRange } from "@/lib/date-format";
import { useNow, useTimezone } from "@/providers";

/**
 * A holiday break, as both feeds draw it: one entry in its dated place, the
 * break's dates and name with a neutral "No session" tag — "13–17 Oct ·
 * Autumn break".
 *
 * **The shape of a past cancellation, on either side of the present.** A
 * holiday was never going to run, so there is nothing to warn about and
 * nothing to act on: it takes the quiet bordered entry a cancelled date
 * already behind us takes — muted ink, an outline tag — never the warning
 * panel an upcoming cancellation gets. It is not dashed either, because the
 * dashed line means a session ran with nothing recorded. It takes no controls
 * on any surface, an admin's included.
 *
 * The name is the break's own, in the reader's locale through the shared
 * per-locale fallback; the range is the break's bare dates in the compact
 * form every holiday list uses, UTC-pinned, with the year only where the break
 * crosses one or falls outside the reader's current year, and a one-day break
 * names one date.
 */
export function SessionHolidayLine({
  names,
  startDate,
  endDate,
}: {
  names: readonly { locale: string; name: string }[];
  startDate: string;
  endDate: string;
}) {
  const b = useTranslations("sessionBadge");
  const locale = resolveLocale(useLocale());
  // Only the year is read from it, off the shared server-seeded clock so the
  // server render and the first client render agree on it.
  const today = formatInTimeZone(useNow(), useTimezone(), "yyyy-MM-dd");

  return (
    <div
      data-tone="muted"
      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground"
    >
      <span className="flex flex-wrap items-center gap-x-2">
        <span className="tabular-nums">
          {formatCompactDateRange(startDate, endDate, locale, today)}
        </span>
        <span>{breakName({ names }, locale)}</span>
      </span>
      <Badge
        variant="outline"
        className="gap-1 text-[10px] uppercase tracking-wide text-muted-foreground"
      >
        <CalendarOff className="h-3 w-3" aria-hidden />
        {b("noSession")}
      </Badge>
    </div>
  );
}
