import type { GamerBirthMonthYear } from "@/lib/gamer-birth";

/**
 * **Is this child inside the product's age range?**
 *
 * A product with a gamer audience carries a `min_age`/`max_age` pair (each side
 * nullable, and a null side never blocks), and the enrolment picker shows a
 * child outside that band as a disabled row with the reason in place — the same
 * treatment an already-enrolled child gets, and for the same reason: a row the
 * action cannot apply to is refused where the parent can see it, not after the
 * click.
 *
 * **The stored birth is a month, not a day.** `gamer_profiles` holds a birth
 * year and month and nothing finer, so a stored March 2017 means "born some
 * time in March 2017" and the child's real age today is one of two adjacent
 * numbers. That ambiguity is resolved *in the family's favour* at both ends,
 * because the cost of the two errors is not symmetric: letting a child who
 * might be in range enrol is a conversation, and locking a child who really is
 * in range out of a club is a family we never hear from again. So:
 *
 * - the **oldest** they could be (born on the 1st) is what the minimum is
 *   tested against, and
 * - the **youngest** they could be (born on the last day of the month) is what
 *   the maximum is tested against.
 *
 * **The two ends also read the calendar at different dates**, which is the one
 * asymmetry a reader should not have to guess at. The minimum is measured at
 * the *later* of today and the product's start date: a child who turns eight
 * before the club's first session is eight when they attend it, and refusing
 * them a seat in the weeks beforehand would be refusing them on a fact that is
 * no longer true by the time it matters. The maximum is measured today,
 * because a product does not stop admitting a child for growing older between
 * signing up and starting — the band's upper end is about who the product is
 * for, and the family has already decided that by the time they are looking at
 * the panel.
 *
 * Pure, and takes "today" as a calendar date rather than reading a clock: today
 * is a date in *somebody's* IANA zone and this module has no way to know whose.
 * The caller resolves it (`formatInTimeZone(new Date(), tz, "yyyy-MM-dd")` with
 * the viewer's zone) and hands the string over, which is also what makes every
 * boundary here testable without pinning a runtime zone.
 */

/**
 * Which side of the product's band the child falls outside, or `null` when they
 * are inside it (or the product declares no bound on that side).
 */
export type GamerAgeBlock = "under" | "over";

export interface GamerAgeEligibilityInput {
  /** `products.min_age` — null on a product that names no lower bound. */
  minAge: number | null;
  /** `products.max_age` — null on a product that names no upper bound. */
  maxAge: number | null;
  /** `gamer_profiles.birth_year` and `birth_month`. */
  birth: GamerBirthMonthYear;
  /** Today as a calendar date in the viewer's zone, `YYYY-MM-DD`. */
  today: string;
  /** `products.start_date`, `YYYY-MM-DD`, or null on an open-ended product. */
  startDate: string | null;
}

export function gamerAgeBlock({
  minAge,
  maxAge,
  birth,
  today,
  startDate,
}: GamerAgeEligibilityInput): GamerAgeBlock | null {
  // Under first: a child can only ever be outside one end of a band, and
  // ordering the tests makes that explicit rather than leaving two truths to be
  // resolved by whichever branch happened to run.
  if (minAge !== null) {
    // The later of today and the start date. Both are bare `YYYY-MM-DD`
    // strings, which compare lexicographically exactly as they compare as
    // dates — no parsing, and so no zone to get wrong.
    const reference =
      startDate !== null && startDate > today ? startDate : today;
    // The oldest they could be: born on the 1st of the birth month, which is
    // the age `ageOnDate` states.
    if (ageOnDate(birth, reference) < minAge) {
      return "under";
    }
  }

  if (maxAge !== null) {
    // The youngest they could be: born on the last day of the birth month.
    if (possibleAgeOnDate(birth, today).min > maxAge) {
      return "over";
    }
  }

  return null;
}

/**
 * **A child's age in whole years on a given calendar date — the one age rule.**
 *
 * The stored birth is a year and a month, so the rule has to say when in the
 * birth month a child turns a year older, and it says: **on the 1st.** A child
 * born in March 2017 is 8 from 1 March 2025 to the end of February 2026. Every
 * age the product shows — the pill beside a child in the enrolment picker, the
 * age on a roster or a chip, the age on a gamer's own page — is this number,
 * and the trainee rosters compute the same one in the database. It is the
 * oldest the child could be, which is the end of the range below that the
 * band's minimum is tested against.
 *
 * Exported because the pill and the block have to be one reading of one clock.
 * A surface deriving the pill from its own `new Date()` while the block reads a
 * date resolved elsewhere would, for the minutes around midnight in the
 * viewer's zone, print an age the refusal beside it contradicts — a page
 * arguing with itself about a child's birthday. One date string in, both
 * answers out.
 *
 * `on` is split textually and never parsed as a `Date`: a bare calendar date
 * carries no instant, and `new Date("2026-03-01")` is UTC midnight, which reads
 * back as February for any viewer west of UTC.
 */
export function ageOnDate(birth: GamerBirthMonthYear, on: string): number {
  const [onY, onM] = on.split("-").map(Number);
  return onY - birth.year - (onM < birth.month ? 1 : 0);
}

/**
 * **Every age the child could be on a given calendar date**, as the inclusive
 * range the birth month allows: `max` is the age of somebody born on the
 * month's 1st — `ageOnDate`'s answer — and `min` the age of somebody born on
 * its last day. The two are equal except in the child's birth month, where the
 * real birthday may or may not have passed.
 *
 * The same reading of the same ambiguity as the band above, stated as a range
 * rather than resolved in anyone's favour — for a reader that reports the
 * uncertainty instead of deciding on it (the partner API's research ages), or
 * that has to ask whether an age is *possibly* in range (`min <= band max` and
 * `max >= band min`).
 */
export function possibleAgeOnDate(
  birth: GamerBirthMonthYear,
  on: string,
): { min: number; max: number } {
  const max = ageOnDate(birth, on);
  const [onY, onM, onD] = on.split("-").map(Number);
  // Inside a later year's birth month, somebody born on the month's last day
  // has had their birthday only once `on` is that day.
  const beforeLastDay =
    onY > birth.year &&
    onM === birth.month &&
    onD < lastDayOfMonth(birth.year, birth.month);
  return { min: beforeLastDay ? max - 1 : max, max };
}

/**
 * The last day of a month, as a day number. `Date.UTC(y, m, 0)` is day zero of
 * the month after the 1-based month `m`, which is the last day of `m`, and
 * UTC-pinned so no runtime zone can shift it across a boundary.
 */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
