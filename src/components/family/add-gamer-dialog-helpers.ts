/**
 * Returns the rolling list of valid birth years for the Add Gamer form,
 * given a reference date (defaults to today).
 *
 * Window: ages 6–18 today. Boundary cases (where month combinations
 * technically yield age 5 or 19 depending on DOB) are accepted by design
 * — see plan: "Keep it simple. Age 6 and 18 are the expected range we
 * should ALWAYS have a year that allows a gamer to be created in that
 * range, if some dates accidentally slip in ages 5 or 19 that's ok."
 *
 * Sorted descending so the youngest age (current year - 6) appears first.
 */
export function gamerBirthYearOptions(today: Date = new Date()): number[] {
  const currentYear = today.getFullYear();
  return Array.from({ length: 13 }, (_, i) => currentYear - 6 - i);
}

/**
 * Composes the gamer's date_of_birth from the form's separate month + year
 * selectors. The DB stores a full DATE; we anchor to the first of the
 * selected month since the form intentionally doesn't ask for the day.
 */
export function assembleGamerDateOfBirth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
