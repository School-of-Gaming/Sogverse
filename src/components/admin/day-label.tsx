"use client";

import { useLocale, useTranslations } from "next-intl";
import { cn, formatDateOnly } from "@/lib/utils";
import { formatDayMonth } from "@/lib/calendar-date";
import { isoWeekOf } from "@/lib/iso-week";

/**
 * The admin surfaces' way of stating a day in a run of days: a fixed-width
 * column reading `weekday-short day/month · week N` beside the day's items, with
 * a month heading only where the month changes.
 *
 * Shared so that two feeds which both read as "a run of dates, each with its
 * items" state a date the same way — an admin reading the dashboard's Coming up
 * and the Substitutions queue is comparing the same days.
 */

/**
 * One day, as the column beside its items.
 *
 * `sm:w-32` — 128px — because the week number has to fit on the same line as
 * the date in every locale. The widest is French, whose weekday abbreviation
 * keeps its stop and whose week prefix is a bare letter: `lun. 17/08 · S34` is
 * sixteen characters at 12px, seven of them tabular digits, which measures a
 * little over 100px; Swedish (`mån 17/12 · v. 34`) is the same order. 96
 * clipped both onto two lines.
 */
export function DayLabel({
  date,
  id,
  className,
}: {
  /** The calendar date, `YYYY-MM-DD`. */
  date: string;
  /** For a list of the day's items to name itself by this label. */
  id?: string;
  /** Where the label sits against its items — the column itself is fixed. */
  className?: string;
}) {
  const locale = useLocale();
  const c = useTranslations("common");

  return (
    <p
      id={id}
      className={cn(
        "shrink-0 text-xs font-medium tabular-nums sm:w-32",
        className,
      )}
    >
      {formatDateOnly(date, locale, { weekday: "short" })}{" "}
      {formatDayMonth(date, locale)}
      {/* The ISO week the date falls in — an admin plans in week numbers.
          Appended after the date, never instead of it. */}
      <span className="text-muted-foreground">
        {` · ${c("week", { week: isoWeekOf(date).week })}`}
      </span>
    </p>
  );
}

/**
 * The month heading over a run of days, drawn only where the month changes.
 * Over scattered dates the reader otherwise has to hold "which month am I in"
 * from the last row that happened to spell it out.
 */
export function MonthHeading({ date }: { date: string }) {
  const locale = useLocale();

  return (
    <p className="mb-1 mt-4 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">
      {/* A month name is date formatting, so it comes from `Intl` in the
          reader's locale rather than out of a label array. */}
      {formatDateOnly(date, locale, { month: "long", year: "numeric" })}
    </p>
  );
}

/**
 * Whether `dates[index]` opens a month — the first day, or one whose month
 * differs from the day before it. Compared on the bare `YYYY-MM` rather than on
 * the rendered heading, so it does not depend on how a locale words a month.
 */
export function startsMonth(dates: readonly string[], index: number): boolean {
  return index === 0 || dates[index - 1].slice(0, 7) !== dates[index].slice(0, 7);
}
