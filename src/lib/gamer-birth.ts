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

/** A stored birth date, split back into the two values a form edits. */
export interface GamerBirthMonthYear {
  year: number;
  /** 1–12, matching the value `assembleGamerDateOfBirth` takes. */
  month: number;
}

/** One entry of a birth-month select: the 1–12 value and its name in the locale. */
export interface GamerBirthMonthOption {
  value: number;
  /** The locale's own month name, from `Intl` — never a translated string. */
  label: string;
}

/**
 * What a month select needs in order to know which of its months are still in
 * the past: the year sitting beside it, and today in the *viewer's* zone.
 *
 * The two "current" fields are arguments rather than a `new Date()` inside,
 * because "today" is a calendar date in somebody's IANA zone and this file has
 * no way to know whose — the caller resolves it with `formatInTimeZone` and
 * hands the digits over, which also leaves this helper pure and testable.
 */
export interface GamerBirthMonthClamp {
  /** The year currently chosen in the year select beside this one. */
  selectedYear: number;
  /** Today's year in the viewer's zone. */
  currentYear: number;
  /** Today's month in the viewer's zone, 1–12. */
  currentMonth: number;
  /**
   * The month+year the row already holds, when editing one. Its own month is
   * never clamped away — see below.
   */
  stored?: GamerBirthMonthYear;
}

/**
 * The months a birth-month select offers, labelled in the caller's locale.
 *
 * **Why a clamp at all.** `date_of_birth` carries a `<= CURRENT_DATE` CHECK, and
 * the year select can legitimately offer the current year (never from the
 * rolling enrollment band — `MIN_ENROLLMENT_AGE` puts its youngest year six back
 * — but `gamerBirthYearOptionsIncluding` carries a stored one). With the current
 * year chosen, every month after this one assembles a future date that the
 * database rejects, and all the admin gets back is the generic save error. So
 * when the selected year *is* the current year, only months up to this one are
 * offered and the invalid choice cannot be made.
 *
 * **The stored month is never clamped away.** Same principle as
 * `gamerBirthYearOptionsIncluding`: a select whose value matches no option
 * renders as though nothing were chosen and saves as something else the moment
 * anything beside it is touched. If a row somehow holds a future month in the
 * current year, its own month stays selectable — carried the way that function
 * carries a year, one value, not the whole span up to it.
 *
 * Called with no clamp (the parent's Add Gamer form, which offers no year the
 * clamp could bite on) it is the plain twelve.
 */
export function gamerBirthMonthOptions(
  locale: string,
  clamp?: GamerBirthMonthClamp,
): GamerBirthMonthOption[] {
  const fmt = new Intl.DateTimeFormat(locale, { month: "long" });
  return selectableBirthMonths(clamp).map((month) => ({
    value: month,
    // The year and day are arbitrary — only the month name is read out.
    label: fmt.format(new Date(2000, month - 1, 1)),
  }));
}

/** The 1–12 values `gamerBirthMonthOptions` labels, ascending. */
function selectableBirthMonths(clamp?: GamerBirthMonthClamp): number[] {
  const all = Array.from({ length: 12 }, (_, i) => i + 1);
  if (!clamp || clamp.selectedYear !== clamp.currentYear) return all;

  const months = all.filter((month) => month <= clamp.currentMonth);
  const { stored } = clamp;
  if (
    stored &&
    stored.year === clamp.selectedYear &&
    stored.month > clamp.currentMonth
  ) {
    // Appended, which keeps the list ascending: it is past every month the
    // filter above kept.
    months.push(stored.month);
  }
  return months;
}

/**
 * Composes the gamer's date_of_birth from a separate month + year selection.
 * The DB stores a full DATE; we anchor to the first of the selected month since
 * no form asks for the day.
 */
export function assembleGamerDateOfBirth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
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
