import { activityTypeOf } from "@/lib/activity-type";
import type { ProductType } from "@/types";

/**
 * The newcomer badge's clock and its product gate, as pure functions.
 *
 * A gamer is "new" to a group for {@link NEWCOMER_WINDOW_DAYS} days after
 * `group_joined_at` was stamped, and the badge spends that window visibly —
 * a Gedu glancing at a roster reads not just "new" but "how new", and a gamer
 * three weeks in visibly needs less of a welcome than one who joined
 * yesterday. All this module owns is the number of days and whether a product
 * of this type draws the badge at all; how the badge looks is the badge's
 * business.
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

/**
 * Whether the newcomer badge is drawn at all on a product of this type — true
 * for the two club types, false for camps and events, where everyone starts at
 * once and "new" distinguishes nobody.
 *
 * **This is the whole of the clubs-only gate, and it lives here rather than in
 * the four RPCs that emit `group_joined_at`.** The stamp is a *fact*; whether to
 * draw it is a *presentation* rule. Making an RPC lie about the fact so a client
 * need not know the rule would put the same decision in four places, and would
 * leave a future reader unable to tell a silently-nulled camp column from a seat
 * with no stamp at all.
 *
 * It is stated in terms of {@link activityTypeOf} rather than by listing the two
 * club types, because that module already owns the four-types-to-three-nouns
 * mapping and already documents why `consumer_club` and `municipality_club` are
 * one noun. A fifth product type is therefore a decision made once, there.
 *
 * The **note** has no such gate: a note is just as useful on a camp, and nobody
 * asked for one.
 */
export function showsNewcomerBadge(productType: ProductType): boolean {
  return activityTypeOf(productType) === "club";
}
