/**
 * Pure decision for a placed gamer's client auto-confinement (see
 * src/components/voice/VoiceRoomProvider.tsx). A gamer placed in a private zone
 * is pinned there by their occupancy row; this reducer decides, on each change,
 * whether to pull them in, release them, or do nothing.
 *
 * The subtle case it exists to get right is a moderator's "free-then-move": two
 * racing async ops — delete the occupancy row (Supabase realtime) and `moveUser`
 * the gamer to a normal zone (Daily app-message) — where the moveUser usually
 * lands first. The pull-in must be *one-shot per zone* (`confinedZone`): once the
 * gamer has reached their occupancy zone we stop pulling, so the still-present
 * row racing its own deletion doesn't yank them back, and the row's later
 * deletion doesn't then drop them to the lobby. Keeping this a pure function lets
 * the exact race sequence be replayed deterministically in a unit test.
 */
export type ConfinementAction = "confine" | "releaseToLobby" | "none";

export interface ConfinementState {
  /** The private zone the gamer's occupancy row assigns them to, or null. */
  myZone: string | null;
  /** The zone the gamer is currently standing in (their userData zone). */
  currentZoneId: string;
  /** The private zone already auto-confined into (the one-shot guard), or null. */
  confinedZone: string | null;
  /** Whether `currentZoneId` is a locked (private) zone. */
  currentZoneIsLocked: boolean;
}

export interface ConfinementResult {
  action: ConfinementAction;
  /** The next value for the `confinedZone` guard. */
  confinedZone: string | null;
}

export function nextConfinement({
  myZone,
  currentZoneId,
  confinedZone,
  currentZoneIsLocked,
}: ConfinementState): ConfinementResult {
  if (myZone) {
    // Reached our occupancy zone → record it and stop pulling.
    if (currentZoneId === myZone) return { action: "none", confinedZone: myZone };
    // Haven't confined into *this* zone yet → pull in. Covers initial placement
    // and a direct private→private move (the new zone differs from the guard).
    if (confinedZone !== myZone) return { action: "confine", confinedZone };
    // Confined into myZone already but now standing elsewhere → a moderator is
    // moving us out (the row is mid-deletion). Don't fight it.
    return { action: "none", confinedZone };
  }
  // No occupancy row. Release to the lobby only if we're still standing in a
  // private zone (else a mod's moveUser already placed us in a normal zone —
  // leave us there).
  if (currentZoneIsLocked) return { action: "releaseToLobby", confinedZone: null };
  return { action: "none", confinedZone: null };
}
