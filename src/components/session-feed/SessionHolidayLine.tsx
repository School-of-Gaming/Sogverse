"use client";

import { formatInTimeZone } from "date-fns-tz";
import { CalendarOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { breakName } from "@/lib/holiday-breaks";
import { formatCompactDateRange } from "@/lib/utils";
import { useNow, useTimezone } from "@/providers";

/**
 * A holiday break, as both feeds draw it: one calm line in its dated place —
 * "No session · Autumn break, 13–17 Oct".
 *
 * **Never the cancelled look.** A cancellation is a session that was going to
 * run and will not, which somebody may need to act on; a holiday date was
 * never planned, so there is nothing to warn about. The line is the quiet ink
 * and the muted glyph, with no edge and no tag — not dashed either, because
 * the dashed line means a session ran with nothing recorded. It takes no
 * controls on any surface, an admin's included.
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
  const t = useTranslations("sessionFeed");
  const locale = resolveLocale(useLocale());
  // Only the year is read from it, off the shared server-seeded clock so the
  // server render and the first client render agree on it.
  const today = formatInTimeZone(useNow(), useTimezone(), "yyyy-MM-dd");

  return (
    <p
      data-tone="muted"
      className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"
    >
      <CalendarOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {t("holidayLine", {
          breakName: breakName({ names }, locale),
          range: formatCompactDateRange(startDate, endDate, locale, today),
        })}
      </span>
    </p>
  );
}
