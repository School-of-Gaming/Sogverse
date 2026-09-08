/**
 * ISO 8601 week arithmetic on bare `YYYY-MM-DD` dates.
 *
 * Finnish admins plan municipality clubs in week numbers — "kerho alkaa
 * viikolla 34" — so a week number is a first-class way to say *when*, not a
 * decoration on a date picker. Everything here is built on
 * `@/lib/calendar-date`, which is UTC-pinned end to end: a week number belongs
 * to a bare calendar date, and re-anchoring one to a viewer's zone would land a
 * day out — and therefore, one day a year, a whole week out.
 *
 * The three ISO rules everything below follows:
 *
 * 1. A week runs **Monday to Sunday**.
 * 2. **Week 1 is the week containing 4 January** — equivalently, the week
 *    holding the year's first Thursday, equivalently the week with the majority
 *    of its days in the new year.
 * 3. A year therefore has **52 or 53** weeks.
 *
 * The consequence that catches people: an ISO year is not a calendar year. The
 * last days of December can belong to week 1 of the *next* ISO year (2026-W01
 * starts on 2025-12-29), and the first days of January can belong to week 52 or
 * 53 of the *previous* one (2027-01-03 is 2026-W53). That is why every value
 * here is an `{ isoYear, week }` pair and never a bare week number: a week
 * number without its ISO year is ambiguous for six days either side of New
 * Year, which in a product that sells autumn and spring terms is exactly the
 * seam admins work across.
 */

import { addCalendarDays, parseCalendarDate, weekdayOf } from "@/lib/calendar-date";

/**
 * One ISO week. `isoYear` is the ISO week-numbering year, which may differ by
 * one from the calendar year of any given day in the week — see the module
 * comment.
 */
export interface IsoWeek {
  isoYear: number;
  week: number;
}

/** Whole days from `from` to `to`, exact because both ends are UTC-pinned. */
function daysBetween(from: string, to: string): number {
  const millis =
    parseCalendarDate(to).getTime() - parseCalendarDate(from).getTime();
  return Math.round(millis / 86_400_000);
}

/**
 * The ISO week a bare date falls in.
 *
 * The Thursday of the week is what names the ISO year: rule 2 says week 1 holds
 * the first Thursday, so whichever calendar year a week's Thursday lands in is
 * the year that week is numbered against. Counting Mondays from that year's
 * first Monday then gives the week number directly.
 */
export function isoWeekOf(date: string): IsoWeek {
  const monday = addCalendarDays(date, -weekdayOf(date));
  const thursday = addCalendarDays(monday, 3);
  const isoYear = Number(thursday.slice(0, 4));
  const firstMonday = isoWeekStart({ isoYear, week: 1 });
  return { isoYear, week: daysBetween(firstMonday, monday) / 7 + 1 };
}

/**
 * The Monday the week starts on, as a bare date.
 *
 * Anchored on 4 January, which rule 2 guarantees is in week 1 of its own ISO
 * year whatever weekday it happens to be. Note that the answer can sit in the
 * previous calendar year: `isoWeekStart({ isoYear: 2026, week: 1 })` is
 * `2025-12-29`.
 */
export function isoWeekStart(week: IsoWeek): string {
  const jan4 = `${String(week.isoYear).padStart(4, "0")}-01-04`;
  const firstMonday = addCalendarDays(jan4, -weekdayOf(jan4));
  return addCalendarDays(firstMonday, (week.week - 1) * 7);
}

/**
 * The Sunday the week ends on, as a bare date. Can sit in the next calendar
 * year: `isoWeekEnd({ isoYear: 2026, week: 53 })` is `2027-01-03`.
 */
export function isoWeekEnd(week: IsoWeek): string {
  return addCalendarDays(isoWeekStart(week), 6);
}

/**
 * How many ISO weeks an ISO year has — 52, or 53 in the years long enough to
 * hold an extra Thursday.
 *
 * 28 December is always in the last ISO week of its own year: it is at least
 * four days from the year end, so its week's Thursday cannot have slipped into
 * January. That makes it the cheapest place to ask.
 */
export function isoWeeksInYear(isoYear: number): 52 | 53 {
  const { week } = isoWeekOf(`${String(isoYear).padStart(4, "0")}-12-28`);
  return week === 53 ? 53 : 52;
}

/**
 * How many ISO weeks a date span touches, counting both ends.
 *
 * This is the number an admin means by "how long does this club run?" — a term
 * from Monday 17 August to Friday 11 December is seventeen weeks of sessions,
 * not the 16.6 that dividing days by seven gives. Both ends are rounded out to
 * their own week, so a span inside one week is 1, and a span whose end precedes
 * its start is 0 rather than a negative count every caller has to remember to
 * guard.
 */
export function isoWeeksBetween(startDate: string, endDate: string): number {
  if (endDate < startDate) return 0;
  const startMonday = addCalendarDays(startDate, -weekdayOf(startDate));
  const endMonday = addCalendarDays(endDate, -weekdayOf(endDate));
  return daysBetween(startMonday, endMonday) / 7 + 1;
}

/**
 * Parses what an admin types into a "go to week" box.
 *
 * Accepts a bare number (`34`), any of the prefixes the locales' own shorthands
 * use (`vk 34`, `wk34`, `v. 34`, `S34`, `W34`), and the full ISO designator with
 * or without its hyphen (`2026-W34`, `2026W34`). Surrounding whitespace is
 * ignored and matching is case-insensitive, because a box like this is typed at
 * speed between other work.
 *
 * A bare number takes `defaultIsoYear` — normally the ISO year of whatever the
 * picker is currently showing, so typing `34` still means a week near the one on
 * screen rather than one the caller has to disambiguate. A full designator
 * carries its own year and ignores the default.
 *
 * Returns `null` for anything unrecognised, for week 0, and for a week above
 * `isoWeeksInYear` of the *resolved* year — the bound is 53 in a long year and
 * 52 in a short one, so `53` is a real week in 2026 and not a week at all in
 * 2025.
 */
export function parseIsoWeekInput(
  text: string,
  defaultIsoYear: number,
): IsoWeek | null {
  const trimmed = text.trim().toLowerCase();

  const designator = /^(\d{4})-?w\s*(\d{1,2})$/.exec(trimmed);
  // The prefix alternatives are listed longest-first so `v.` wins over `v`, and
  // the optional group holds no quantifier of its own — a `\s*` nested inside an
  // optional group is the shape that makes a regex worth backtracking over.
  const shorthand = /^(?:vk|wk|v\.|v|w|s)?\s*(\d{1,2})$/.exec(trimmed);

  const digits = designator?.[2] ?? shorthand?.[1];
  if (digits === undefined) return null;

  const isoYear = designator ? Number(designator[1]) : defaultIsoYear;
  const week = Number(digits);
  if (week < 1 || week > isoWeeksInYear(isoYear)) return null;
  return { isoYear, week };
}
