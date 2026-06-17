/**
 * The private-zone privacy boundary, expressed as Daily `canReceive`.
 *
 * Voice runs in a *single* Daily room (see src/components/voice/CLAUDE.md). A
 * private (locked) zone isn't a separate room — it's an SFU-enforced rule on who
 * may *receive* whom. Daily's `canReceive` is receiver-side and enforced at the
 * SFU, so a blocked viewer is never sent the track at all (a structural
 * guarantee, not a client-side `volume = 0`), while presence + userData still
 * flow (so the viewer still sees the occupant's name/avatar behind a blur).
 *
 * The rule is one line and one-directional:
 *
 *   > A viewer may receive everyone EXCEPT a private-zone occupant whose zone
 *   > the viewer is not also in.
 *
 * That single rule covers every case:
 *   - a normal-zone viewer is blocked from *all* private occupants;
 *   - a private occupant keeps their own zone-mates, and still receives every
 *     *normal* zone (so a moderator in a private zone keeps video + speaking-glow
 *     awareness of the room — the reverse direction is deliberately permissive);
 *   - a private occupant is blocked from *other* private zones.
 *
 * It's a pure projection of current occupancy — recomputed wholesale and applied
 * idempotently (baked into a joiner's token, re-applied by owners on any
 * change), never patched as incremental pairwise deltas. That's what removes the
 * race-bug class: a full-state write converges regardless of event ordering.
 */

/** A user currently in a private zone, keyed by their Daily `user_id` (= the
 *  profile id stamped on the meeting token and on the occupancy row). */
export interface PrivateOccupant {
  userId: string;
  zoneId: string;
}

/**
 * The user ids `viewerUserId` must NOT receive: private-zone occupants whose
 * zone the viewer is not also in. Pure — no side effects, no ordering
 * assumptions. Used by the token route (block set → baked `canReceive`) and the
 * client projection (expanded to an explicit allow/deny over live participants).
 */
export function blockedUserIdsFor(
  viewerUserId: string,
  occupants: PrivateOccupant[],
): string[] {
  const viewerZone =
    occupants.find((o) => o.userId === viewerUserId)?.zoneId ?? null;
  return occupants
    .filter((o) => o.userId !== viewerUserId && o.zoneId !== viewerZone)
    .map((o) => o.userId);
}

/** The Daily `canReceive` permission object for a *fresh* token (no prior state
 *  to clear): `base: true` plus a `false` block per non-co-zoned private
 *  occupant. Returns `undefined` when there's nothing to block, so the token
 *  inherits the room/domain default and we don't send a redundant permission. */
export function tokenCanReceiveFor(
  viewerUserId: string,
  occupants: PrivateOccupant[],
): { base: true; byUserId: Record<string, boolean> } | undefined {
  const blocked = blockedUserIdsFor(viewerUserId, occupants);
  if (blocked.length === 0) return undefined;
  return { base: true, byUserId: Object.fromEntries(blocked.map((u) => [u, false])) };
}
