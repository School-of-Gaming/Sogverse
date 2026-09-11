/**
 * Snapping a product's start and end dates onto days the product actually
 * meets.
 *
 * A product stores `start_date` and `end_date` as bare calendar dates, and its
 * meeting pattern separately as `schedule_slots` whose `weekday` is
 * 0 = Monday … 6 = Sunday — the same convention `weekdayOf` returns. Nothing in
 * the schema ties the two together, so an admin creating a Wednesday club could
 * store a Monday as its start date, and every surface that reads that column
 * told families the club "starts Monday" when the first session was two days
 * later. The same defect at the other end had a term appearing to run past its
 * final session.
 *
 * The helpers here are the fix: whatever an admin picks — a date, or a week in
 * a week picker, which is a whole seven days at once — the date that gets
 * stored is a day the product meets. They are pure bare-date arithmetic on
 * `@/lib/calendar-date` and hold no opinion about how a caller surfaces a
 * mismatch (nudging the value, or explaining it in a hint beside the field).
 *
 * **An empty `weekdays` is a passthrough, not an error.** A product with no
 * schedule slots — a camp that runs daily, a product mid-authoring before its
 * slots exist — has no pattern to snap to, so its dates are already whatever
 * the admin meant. Returning the input unchanged keeps the caller free of a
 * special case it would otherwise have to write at every call site.
 */

import { addCalendarDays, weekdayOf } from "@/lib/calendar-date";

/** A week is seven days, so a search either end is bounded by seven steps. */
const DAYS_IN_WEEK = 7;

/**
 * The first date on or after `startDate` whose weekday is one the product
 * meets on.
 *
 * `startDate` itself is returned when it is already a session day, and when
 * `weekdays` is empty. Otherwise the answer is at most six days later, because
 * every weekday in `weekdays` recurs within a week.
 */
export function firstSessionDate(
  startDate: string,
  weekdays: readonly number[],
): string {
  if (weekdays.length === 0) return startDate;
  for (let offset = 0; offset < DAYS_IN_WEEK; offset += 1) {
    const candidate = addCalendarDays(startDate, offset);
    if (weekdays.includes(weekdayOf(candidate))) return candidate;
  }
  return startDate;
}

/**
 * The last date on or before `endDate` whose weekday is one the product meets
 * on.
 *
 * `endDate` itself is returned when it is already a session day, and when
 * `weekdays` is empty. Otherwise the answer is at most six days earlier.
 */
export function lastSessionDate(
  endDate: string,
  weekdays: readonly number[],
): string {
  if (weekdays.length === 0) return endDate;
  for (let offset = 0; offset < DAYS_IN_WEEK; offset += 1) {
    const candidate = addCalendarDays(endDate, -offset);
    if (weekdays.includes(weekdayOf(candidate))) return candidate;
  }
  return endDate;
}

/**
 * Whether a session falls on `date`.
 *
 * True when `weekdays` is empty: there is no pattern to contradict, so no date
 * can be wrong against it. This is what a hint beside a date field asks before
 * deciding whether it has anything to say.
 */
export function isSessionDay(
  date: string,
  weekdays: readonly number[],
): boolean {
  if (weekdays.length === 0) return true;
  return weekdays.includes(weekdayOf(date));
}
