import {
  MIN_ENROLLMENT_AGE,
  MAX_ENROLLMENT_AGE,
} from "@/lib/constants/gamer-age";

/**
 * Returns the rolling list of valid birth years for the Add Gamer form,
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
 * Composes the gamer's date_of_birth from the form's separate month + year
 * selectors. The DB stores a full DATE; we anchor to the first of the
 * selected month since the form intentionally doesn't ask for the day.
 */
export function assembleGamerDateOfBirth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}
