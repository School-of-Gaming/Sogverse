/**
 * A private-zone occupancy row is valid only for its own session window — the
 * token route bakes `canReceive` from current-window occupancy, and the client
 * filters occupancy to the current window before it drives audio routing, the
 * `canReceive` projection, and the gamer auto-confine. So a stale row from a
 * prior session can't trap a gamer or wrongly block media before the server's
 * prune-on-join reaps it.
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
