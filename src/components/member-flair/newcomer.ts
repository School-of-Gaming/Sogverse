/**
 * The newcomer badge's clock, as pure arithmetic.
 *
 * A gamer is "new" to a group for {@link NEWCOMER_WINDOW_DAYS} days after
 * `group_joined_at` was stamped, and the badge spends that window visibly —
 * a Gedu glancing at a roster reads not just "new" but "how new", and a gamer
 * three weeks in visibly needs less of a welcome than one who joined
 * yesterday. All this module owns is the number of days; how the badge draws
 * them is the badge's business.
 *
 * The window is a duration between instants, not calendar stepping, so DST is
 * irrelevant at this scale: a badge expiring an hour "early" once a year on a
 * 30-day window is invisible, and the arithmetic stays exact everywhere.
 */

/** How long a member reads as new to their group. */
export const NEWCOMER_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * Whole days since a member joined their group, or `null` once the window has
 * passed — which is also the answer for a member with no stamp at all, so
 * callers can hand this `null` straight through.
 *
 * A stamp in the future (clock skew between the DB and the viewer) clamps to
 * "joined today" rather than going negative or throwing.
 */
export function newcomerDaysIn(
  joinedAt: string | null | undefined,
  now: Date,
): number | null {
  if (!joinedAt) return null;
  const joined = new Date(joinedAt).getTime();
  if (Number.isNaN(joined)) return null;

  const elapsedDays = Math.max(0, (now.getTime() - joined) / DAY_MS);
  if (elapsedDays >= NEWCOMER_WINDOW_DAYS) return null;

  return Math.floor(elapsedDays);
}
