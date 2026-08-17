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
 */

/** Weekday column headings, Monday-first, matching `weekday` 0…6. */
export const WEEKDAY_LABELS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

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

/** 0 = Monday … 6 = Sunday, the convention `schedule_slots.weekday` uses. */
export function weekdayOf(iso: string): number {
  return (parseCalendarDate(iso).getUTCDay() + 6) % 7;
}

/** The Monday of the week `iso` falls in. */
export function mondayOf(iso: string): string {
  return addCalendarDays(iso, -weekdayOf(iso));
}

/** `17.8.` — the Finnish short form, and short enough for a row heading. */
export function formatDayMonth(iso: string): string {
  return `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.`;
}

/** `August 2026` — the coming-up feed's month divider. */
export function formatMonth(iso: string): string {
  return `${MONTH_LABELS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
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
