import {
  MIN_ENROLLMENT_AGE,
  MAX_ENROLLMENT_AGE,
} from "@/lib/constants/gamer-age";

/**
 * The month+year granularity a gamer's birth date is authored at.
 *
 * `gamer_profiles.date_of_birth` is a full `date`, but nothing in the product
 * ever asks for the day — a parent creating a child picks a month and a year,
 * and an admin correcting one picks the same two. These helpers are the seam
 * between that pair and the stored string, and they live here rather than beside
 * either form because both surfaces reach for them: the parent's Add Gamer
 * dialog writes a new row, the admin's user page edits an existing one, and a
 * helper owned by one of them would make the other look like it was borrowing.
 */

/**
 * Returns the rolling list of valid birth years for the birth-date selectors,
 * given a reference date (defaults to today).
 *
 * Window: the enrollment age band from `@/lib/constants/gamer-age`
 * (MIN_ENROLLMENT_AGE…MAX_ENROLLMENT_AGE), which is intentionally one year
 * wider on each side than the product range the shop filters by — so month/DOB
 * boundary cases never lock a real kid out of creating an account.
 *
 * Sorted descending so the youngest age (current year − MIN_ENROLLMENT_AGE)
 * appears first.
 */
export function gamerBirthYearOptions(today: Date = new Date()): number[] {
  const currentYear = today.getFullYear();
  const span = MAX_ENROLLMENT_AGE - MIN_ENROLLMENT_AGE + 1;
  return Array.from({ length: span }, (_, i) => currentYear - MIN_ENROLLMENT_AGE - i);
}

/**
 * The same window, guaranteed to contain `year`.
 *
 * For **editing** a stored birth date rather than choosing a new one. The band
 * above is a rolling window, so a row written years ago — or one belonging to an
 * adult seat-holder, or to a child who has since aged out — can hold a year the
 * window no longer offers. A `<select>` whose value matches no option renders as
 * though nothing were chosen, which would put a wrong year in front of an admin
 * and save it the moment they touched the gender beside it. Carrying the stored
 * year keeps the control honest without widening the band for anybody else.
 *
 * Still sorted descending, with no duplicate when the year is already inside.
 */
export function gamerBirthYearOptionsIncluding(
  year: number,
  today: Date = new Date(),
): number[] {
  const years = gamerBirthYearOptions(today);
  if (years.includes(year)) return years;
  return [...years, year].sort((a, b) => b - a);
}

/**
 * Composes the gamer's date_of_birth from a separate month + year selection.
 * The DB stores a full DATE; we anchor to the first of the selected month since
 * no form asks for the day.
 */
export function assembleGamerDateOfBirth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** A stored birth date, split back into the two values a form edits. */
export interface GamerBirthMonthYear {
  year: number;
  /** 1–12, matching the value `assembleGamerDateOfBirth` takes. */
  month: number;
}

/**
 * The inverse of `assembleGamerDateOfBirth`: reads the month and year back out
 * of a stored `YYYY-MM-DD` value.
 *
 * **Split textually, never parsed as a Date.** `new Date("2017-03-01")` is UTC
 * midnight, and reading `getFullYear()`/`getMonth()` off it answers in the
 * runtime's zone — which lands on February for any viewer west of UTC. A bare
 * calendar date carries no instant to convert, so the digits are the answer.
 */
export function splitGamerDateOfBirth(dateOfBirth: string): GamerBirthMonthYear {
  const [year, month] = dateOfBirth.split("-").map(Number);
  return { year, month };
}
