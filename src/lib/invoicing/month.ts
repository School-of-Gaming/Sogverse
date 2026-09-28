import { addCalendarDays, monthsAfter, weekdayOf } from "@/lib/calendar-date";

/**
 * The month arithmetic both invoicing builders stand on — the municipality
 * invoice and the gedu invoice read one month of product-local dates the same
 * way, so the rules for *which* dates a month holds and *where today falls*
 * among them have one home.
 *
 * Everything here is bare calendar-date arithmetic on product-local
 * `YYYY-MM-DD` strings, UTC-pinned through `@/lib/calendar-date`: no clock face
 * ever appears, and a weekday cannot drift under a day step. The one clock is
 * the caller's "today", already resolved in the product's own zone.
 */

/** The last day of the month that starts on `monthStart`. */
export function monthEndOf(monthStart: string): string {
  return addCalendarDays(monthsAfter(monthStart, 1), -1);
}

/** What a projection needs to know about a product: its term and its week. */
export interface ProjectableTerm {
  start_date: string | null;
  end_date: string | null;
  /** 0 = Monday … 6 = Sunday, the `schedule_slots.weekday` convention. */
  schedule_slots: readonly { weekday: number }[];
}

/**
 * Every date a product's weekly schedule puts inside the month, clipped to its
 * own term, both ends inclusive.
 *
 * Two things decide whether there is anything to project at all. A product with
 * no start date has no day to start walking from, and guessing one would invent
 * sessions nobody was ever going to run. And a product with no slots has no
 * weekly claim to project. The start date is also what says whether the term
 * had begun: the walk is clipped to it, so a term starting after this month
 * yields nothing without a separate test for it. An open-ended term runs to the
 * end of the month.
 *
 * The result is unordered and de-duplicated: two slots on one weekday are one
 * date.
 */
export function projectMonthDates(
  term: ProjectableTerm,
  monthStart: string,
  monthEnd: string,
): string[] {
  if (term.start_date === null) return [];

  const from = term.start_date > monthStart ? term.start_date : monthStart;
  const until =
    term.end_date !== null && term.end_date < monthEnd ? term.end_date : monthEnd;
  if (from > until) return [];

  const dates = new Set<string>();
  for (const slot of term.schedule_slots) {
    const offset = (slot.weekday - weekdayOf(from) + 7) % 7;
    for (
      let date = addCalendarDays(from, offset);
      date <= until;
      date = addCalendarDays(date, 7)
    ) {
      dates.add(date);
    }
  }
  return [...dates];
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
 * What a projected date with no stored row is: missed once it is behind today,
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
