/**
 * The newcomer badge's clock, as pure arithmetic.
 *
 * A gamer is "new" to a group for {@link NEWCOMER_WINDOW_DAYS} days after
 * `group_joined_at` was stamped, and the badge *fades* across that window
 * rather than vanishing on a cliff — the fade is the feature: a Gedu glancing
 * at a roster reads not just "new" but "how new", and a gamer three weeks in
 * visibly needs less of a welcome than one who joined yesterday.
 *
 * The window is a duration between instants, not calendar stepping, so DST is
 * irrelevant at this scale: a badge expiring an hour "early" once a year on a
 * 30-day fade is invisible, and the arithmetic stays exact everywhere.
 */

/** How long a member reads as new to their group. */
export const NEWCOMER_WINDOW_DAYS = 30;

const DAY_MS = 86_400_000;

/**
 * The badge never fades below this before disappearing. A linear fade to zero
 * spends its last week illegible-but-present — worse than either state — so
 * the curve runs 1.0 → 0.3 across the window and then the badge is simply
 * gone.
 */
const MIN_OPACITY = 0.3;

export interface NewcomerPresence {
  /** 1.0 on join day, {@link MIN_OPACITY} on the window's last day. */
  opacity: number;
  /** Whole days since the join, for the badge's tooltip. Never negative. */
  daysAgo: number;
}

/**
 * How present the newcomer badge is for a member who joined at `joinedAt`, or
 * `null` once the window has passed — which is also the answer for a member
 * with no stamp at all, so callers can hand this `null` straight through.
 *
 * A stamp in the future (clock skew between the DB and the viewer) clamps to
 * "joined today" rather than over-brightening or throwing.
 */
export function newcomerPresence(
  joinedAt: string | null | undefined,
  now: Date,
): NewcomerPresence | null {
  if (!joinedAt) return null;
  const joined = new Date(joinedAt).getTime();
  if (Number.isNaN(joined)) return null;

  const elapsedDays = Math.max(0, (now.getTime() - joined) / DAY_MS);
  if (elapsedDays >= NEWCOMER_WINDOW_DAYS) return null;

  const progress = elapsedDays / NEWCOMER_WINDOW_DAYS;
  return {
    opacity: 1 - (1 - MIN_OPACITY) * progress,
    daysAgo: Math.floor(elapsedDays),
  };
}
