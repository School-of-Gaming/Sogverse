/**
 * Correct the local user's *own* private-zone occupancy to synchronous truth
 * before it drives rendering, zone bucketing, and the `canReceive` projection
 * (see src/components/voice/VoiceRoomProvider.tsx).
 *
 * Occupancy reaches a client two ways: every *other* user's row arrives via the
 * Supabase Realtime echo (authoritative — it's the mod-written privacy boundary).
 * Your *own* row you also know synchronously the instant you act, and that local
 * truth must win — reading your own state back from the echo lags or drops on
 * mobile Safari, which once pinned a moderator in a private zone they'd already
 * left until the DELETE round-tripped (or for good, if it was lost). Same shape
 * as routing audio against a synchronous local zone instead of the SFU's echo.
 *
 * The exception is confinement, and it proves the rule: a gamer placed in a
 * private zone has no self-move agency, so the mod-written row genuinely *is*
 * their synchronous truth and must outrank even their own client (otherwise they
 * could edit their way out). So the correction applies only to a moderator, who
 * self-enters and self-leaves; a gamer's own row is trusted exactly as echoed.
 *
 * Pure so the stuck-moderator race can be replayed deterministically in a test.
 */
import type { PrivateOccupant } from "./receive-permissions";

export interface SelfOccupancyState {
  /** Private-zone occupancy as echoed by realtime (every user's current row). */
  echoed: PrivateOccupant[];
  /** The local user's Daily `user_id`, or null before we know it (pre-join). */
  localUserId: string | null;
  /** Whether the local user is a moderator (self-manages their own occupancy). */
  isModerator: boolean;
  /** The zone the local user is synchronously standing in (membership truth). */
  localZoneId: string;
  /** Whether `localZoneId` is a locked (private) zone. */
  localZoneIsLocked: boolean;
}

export function correctSelfOccupancy({
  echoed,
  localUserId,
  isModerator,
  localZoneId,
  localZoneIsLocked,
}: SelfOccupancyState): PrivateOccupant[] {
  // A gamer (or a not-yet-identified client) can't self-manage confinement:
  // trust the echo as-is — the mod-written row outranks their own client.
  if (!isModerator || !localUserId) return echoed;
  // A moderator's own row is whatever their synchronous position says, never the
  // echo of it: present iff they're standing in a locked zone right now.
  const others = echoed.filter((o) => o.userId !== localUserId);
  return localZoneIsLocked
    ? [...others, { userId: localUserId, zoneId: localZoneId }]
    : others;
}
