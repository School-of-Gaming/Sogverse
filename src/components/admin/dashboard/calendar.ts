/**
 * Calendar arithmetic for the admin dashboard's schedule views.
 *
 * Every date these views handle is a **bare calendar date** — a term's first
 * day, a camp's last day, the Monday a week starts on — so all of it is
 * UTC-pinned end to end: parsed at UTC midnight, stepped with `Date.UTC`, read
 * back through `getUTC*`. UTC has no DST, so day arithmetic there is exact, and
 * a bare date re-anchored to anybody's zone would land a day out for half the
 * planet. Nothing in this module ever sees a clock face; the one time-of-day the
 * grid renders (a chip's `17:00`) is carried through as the string the schedule
 * slot stores.
 *
 * **It names no day and no month.** A weekday heading and a month divider are
 * date *formatting*, so they come out of `Intl` in the reader's locale at the
 * point of render (`formatDateOnly`, which is UTC-pinned for exactly the reason
 * above) rather than out of a label array here — an array would be seven English
 * words this module has no locale to translate. The one formatter that does live
 * here takes the reader's locale as an argument for the same reason.
 */

import { formatDateOnly } from "@/lib/utils";

/** A bare `YYYY-MM-DD` read as an instant at UTC midnight. */
export function parseCalendarDate(iso: string): Date {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

/** A UTC-pinned instant back as a bare `YYYY-MM-DD`. */
export function toCalendarDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  return `${year}-${month}-${day}`;
}

/** `iso` moved `days` forward (or back), as calendar days. */
export function addCalendarDays(iso: string, days: number): string {
  const base = parseCalendarDate(iso);
  return toCalendarDate(
    new Date(
      Date.UTC(
        base.getUTCFullYear(),
        base.getUTCMonth(),
        base.getUTCDate() + days,
      ),
    ),
  );
}

/**
 * `iso` moved `count` calendar months forward, clamped like Postgres.
 *
 * The schedule window the snapshot covers is authored as
 * `date + INTERVAL '4 months'`, and Postgres clamps that to the last day of the
 * target month — 31 October plus four months is 28 February. `Date.UTC` would
 * overflow into 3 March instead and hand the page a week the data does not
 * cover, so the day is clamped before the date is built.
 */
export function addCalendarMonths(iso: string, count: number): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const firstOfTarget = new Date(Date.UTC(year, month - 1 + count, 1));
  const targetYear = firstOfTarget.getUTCFullYear();
  const targetMonth = firstOfTarget.getUTCMonth();
  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0),
  ).getUTCDate();
  return toCalendarDate(
    new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))),
  );
}

/** 0 = Monday … 6 = Sunday, the convention `schedule_slots.weekday` uses. */
export function weekdayOf(iso: string): number {
  return (parseCalendarDate(iso).getUTCDay() + 6) % 7;
}

/** The Monday of the week `iso` falls in. */
export function mondayOf(iso: string): string {
  return addCalendarDays(iso, -weekdayOf(iso));
}

/**
 * `17.8.` in Finnish, `8/17` in en-US — day and month as bare numerals, short
 * enough for a row heading.
 *
 * It carries no *words*, which is not the same as carrying no locale: the order
 * of the two numerals and the separator between them are both a reader's
 * convention, and a hardcoded `d.M.` reads back-to-front for anyone whose
 * calendar puts the month first. So it is `Intl` like every other date on this
 * page, UTC-pinned through `formatDateOnly` because these are bare calendar
 * dates, and the locale is threaded in from whoever is rendering it.
 */
export function formatDayMonth(iso: string, locale: string): string {
  return formatDateOnly(iso, locale, { day: "numeric", month: "numeric" });
}

/**
 * The first day of the month `count` months after the one `iso` falls in.
 *
 * The coming-up feed's horizon is a calendar boundary rather than a day count:
 * "the rest of this month plus three more" ends where a month ends, so the last
 * thing on the feed is never a term boundary sliced in half by an arbitrary
 * ninety-day cutoff.
 */
export function monthsAfter(iso: string, count: number): string {
  const first = parseCalendarDate(iso);
  return toCalendarDate(
    new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + count, 1)),
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
