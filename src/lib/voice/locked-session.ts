/**
 * A locked-zone placement is valid only for its own session window — the
 * locked-token endpoint matches on `session_opens_at`, and the client roster +
 * auto-confine ignore anything that isn't the current window (so a stale row
 * from a prior session can't trap a gamer, flash a doomed room-switch, or
 * phantom-render before the server's prune-on-join reaps it).
 *
 * Compares as **instants**, not strings: a `timestamptz` round-trips through
 * PostgREST / the token response with varying formats (`+00:00` vs `Z`,
 * differing fractional-second precision), so a string `===` would wrongly
 * reject the same moment.
 */
export function isCurrentSessionPlacement(
  placementOpensAt: string,
  currentOpensAt: string | null,
): boolean {
  if (currentOpensAt === null) return false;
  return new Date(placementOpensAt).getTime() === new Date(currentOpensAt).getTime();
}
