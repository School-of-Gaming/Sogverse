import { addCalendarDays, monthsAfter } from "@/lib/calendar-date";

/**
 * The month arithmetic both invoicing builders stand on — the municipality
 * invoice and the gedu invoice read one month of product-local dates the same
 * way, so the rules for where a month ends and *where today falls* among its
 * dates have one home. Which dates were due is not decided here: each document
 * carries its products' planned dates from the database.
 *
 * Everything here is bare calendar-date arithmetic on product-local
 * `YYYY-MM-DD` strings, UTC-pinned through `@/lib/calendar-date`: no clock face
 * ever appears. The one clock is the caller's "today", already resolved in the
 * product's own zone.
 */

/** The last day of the month that starts on `monthStart`. */
export function monthEndOf(monthStart: string): string {
  return addCalendarDays(monthsAfter(monthStart, 1), -1);
}

/**
 * Whether a stored session row counts as a session that happened.
 *
 * Only on a date that has arrived: nothing stops an educator writing a note
 * against next week's session, and that row would otherwise be paid or billed
 * early. A row dated *today* counts — the date is the product's own local day,
 * and writing up the afternoon's session is recording one that ran.
 */
export function recordHasHappened(date: string, today: string): boolean {
  return date <= today;
}

/**
 * What a planned date with no stored row is: missed once it is behind today,
 * merely not reached yet from today on. Today itself is not late — the session
 * may be running as the page is read.
 */
export function unrecordedOrUpcoming(
  date: string,
  today: string,
): "unrecorded" | "upcoming" {
  return date < today ? "unrecorded" : "upcoming";
}

/** Ascending bare-date order, by code unit — `YYYY-MM-DD` sorts as text. */
export function compareCalendarDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
