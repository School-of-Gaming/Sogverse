"use client";

import { useLocale, useTranslations } from "next-intl";
import { parseCalendarDate } from "@/lib/calendar-date";
import { resolveLocale } from "@/lib/constants/locales";
import { isoWeekOf } from "@/lib/iso-week";
import { formatDateOnly } from "@/lib/utils";
import type { HolidayBreakDraft } from "./holiday-calendar-draft";

/**
 * The line that lets a typo in a break's dates be caught at a glance — both
 * days with their weekdays, the length, and the ISO week or weeks — or `null`
 * while the dates are incomplete or the end is before the start. The page's
 * list and the break dialog say it in the same words.
 */
export function useBreakCheckLine(): (
  entry: Pick<HolidayBreakDraft, "startDate" | "endDate">,
) => string | null {
  const t = useTranslations("admin.holidayCalendars");
  const uiLocale = resolveLocale(useLocale());

  return (entry) => {
    if (entry.startDate === "" || entry.endDate === "") return null;
    if (entry.startDate > entry.endDate) return null;
    const day = (date: string) =>
      formatDateOnly(date, uiLocale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    const range = `${day(entry.startDate)} – ${day(entry.endDate)}`;
    const days =
      (parseCalendarDate(entry.endDate).getTime() -
        parseCalendarDate(entry.startDate).getTime()) /
        86_400_000 +
      1;
    const first = isoWeekOf(entry.startDate).week;
    const last = isoWeekOf(entry.endDate).week;
    return first === last
      ? t("checkLine", { range, days, week: first })
      : t("checkLineWeeks", { range, days, first, last });
  };
}
