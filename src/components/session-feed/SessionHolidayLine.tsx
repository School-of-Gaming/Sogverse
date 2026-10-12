"use client";

import { CalendarOff } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { breakName } from "@/lib/holiday-breaks";
import { formatDateRange } from "@/lib/utils";

/**
 * A holiday break, as both feeds draw it: one calm line in its dated place —
 * "No session · Autumn break, 13 Oct 2026 – 17 Oct 2026".
 *
 * **Never the cancelled look.** A cancellation is a session that was going to
 * run and will not, which somebody may need to act on; a holiday date was
 * never planned, so there is nothing to warn about. The line is the quiet ink
 * and the muted glyph, with no edge and no tag — not dashed either, because
 * the dashed line means a session ran with nothing recorded. It takes no
 * controls on any surface, an admin's included.
 *
 * The name is the break's own, in the reader's locale through the shared
 * per-locale fallback; the range is the break's bare dates, UTC-pinned, and a
 * one-day break names one date.
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

  return (
    <p
      data-tone="muted"
      className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"
    >
      <CalendarOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {t("holidayLine", {
          breakName: breakName({ names }, locale),
          range: formatDateRange(startDate, endDate, locale),
        })}
      </span>
    </p>
  );
}
