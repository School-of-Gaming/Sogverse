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
 * **The stored birth date is a month, not a day.** Nothing in the product ever
 * asks a parent for the day of the month — `gamer-birth.ts` assembles
 * `date_of_birth` as the 1st of the chosen month — so a stored `2017-03-01`
 * means "born some time in March 2017" and the child's real age today is one of
 * two adjacent numbers. That ambiguity is resolved *in the family's favour* at
 * both ends, because the cost of the two errors is not symmetric: letting a
 * child who might be in range enrol is a conversation, and locking a child who
 * really is in range out of a club is a family we never hear from again. So:
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
  /** `gamer_profiles.date_of_birth`, `YYYY-MM-DD` and always the 1st. */
  dateOfBirth: string;
  /** Today as a calendar date in the viewer's zone, `YYYY-MM-DD`. */
  today: string;
  /** `products.start_date`, `YYYY-MM-DD`, or null on an open-ended product. */
  startDate: string | null;
}

export function gamerAgeBlock({
  minAge,
  maxAge,
  dateOfBirth,
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
    // The oldest they could be: the stored 1st is the earliest day of the month
    // they could have been born on.
    if (ageOnDate(dateOfBirth, reference) < minAge) return "under";
  }

  if (maxAge !== null) {
    // The youngest they could be: born on the last day of the stored month.
    if (ageOnDate(lastDayOfBirthMonth(dateOfBirth), today) > maxAge) {
      return "over";
    }
  }

  return null;
}

/**
 * **Age in whole years on a given calendar date** — the arithmetic behind both
 * the band above and the age the picker prints beside a child's name, with the
 * reference date handed in as digits instead of being read off a clock in a
 * zone.
 *
 * Exported because the pill and the block have to be one reading of one clock.
 * A surface deriving the pill from its own `new Date()` while the block reads a
 * date resolved elsewhere would, for the minutes around midnight in the
 * viewer's zone, print an age the refusal beside it contradicts — a page
 * arguing with itself about a child's birthday. One date string in, both
 * answers out.
 *
 * Split textually and never parsed as a `Date`: a bare calendar date carries no
 * instant, and `new Date("2017-03-01")` is UTC midnight, which reads back as
 * February for any viewer west of UTC.
 *
 * Note what it is *not* generous about: this is the age of somebody born on the
 * stored day, and the stored day is the 1st of a month nobody was asked the day
 * of. The band above resolves that ambiguity per end; the pill states the
 * stored date's own age, which is the only number there is to state.
 */
export function ageOnDate(birth: string, on: string): number {
  const [birthY, birthM, birthD] = birth.split("-").map(Number);
  const [onY, onM, onD] = on.split("-").map(Number);
  let years = onY - birthY;
  if (onM < birthM || (onM === birthM && onD < birthD)) years--;
  return years;
}

/**
 * The stored birth month's last day, as a `YYYY-MM-DD` string — the latest day
 * the child could actually have been born on.
 *
 * `Date.UTC(y, m, 0)` is the last day of month `m` (day zero of the following
 * month, counting from a 1-based month index that is already the next one), and
 * UTC-pinned so no runtime zone can shift it across a boundary.
 */
function lastDayOfBirthMonth(dateOfBirth: string): string {
  const [year, month] = dateOfBirth.split("-").map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
