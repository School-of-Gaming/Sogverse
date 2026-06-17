import { useEffect, useRef } from "react";
import type { DailyCall } from "@daily-co/daily-js";
import { blockedUserIdsFor, type PrivateOccupant } from "@/lib/voice/receive-permissions";
import type { VoiceParticipant } from "./types";

interface UseReceivePermissionsParams {
  callObjectRef: React.MutableRefObject<DailyCall | null>;
  /** Live mirror of whether the local user is a moderator (token `is_owner`).
   *  Only owners may set others' permissions, so only they run the projection. */
  isModeratorRef: React.MutableRefObject<boolean>;
  joined: boolean;
  participants: VoiceParticipant[];
  /** Current-session private-zone occupancy (from `voice_private_zone_occupants`). */
  occupants: PrivateOccupant[];
}

/** A stable string that changes exactly when who-is-in-which-zone changes —
 *  membership (sessionId→userId) plus occupancy (userId→zone). Lets the effect
 *  skip the SFU round-trip on speaker/track ticks that churn `participants`
 *  without changing the projection. */
function membershipSignature(
  participants: VoiceParticipant[],
  occupants: PrivateOccupant[],
): string {
  const ps = participants
    .map((p) => `${p.sessionId}:${p.userId}`)
    .sort()
    .join(",");
  const os = occupants
    .map((o) => `${o.userId}:${o.zoneId}`)
    .sort()
    .join(",");
  return `${ps}|${os}`;
}

/**
 * Enforce the private-zone privacy boundary *live*, via Daily's SFU-enforced
 * `canReceive`. New joiners already get the boundary baked into their token
 * server-side (airtight, no connect window); this covers changes mid-session —
 * someone entering/leaving a private zone while others are connected.
 *
 * Only an **owner** may set another participant's permissions, so this runs on
 * moderator/admin clients only. It recomputes each participant's *full*
 * `canReceive` from current occupancy and applies it idempotently: every other
 * participant is set explicitly to allow or deny (never an incremental delta),
 * so the result converges regardless of event ordering and a stale over-block
 * from a since-departed occupant self-heals on the next pass. With multiple
 * moderators present each runs the same projection — redundant but identical, so
 * no flapping.
 *
 * The effect depends honestly on `participants`/`occupants`, but only pays the
 * SFU `updateParticipants` round-trip when the membership/occupancy *signature*
 * actually changes — so the frequent speaker/track updates that re-fire it are
 * cheap no-ops.
 */
export function useReceivePermissions({
  callObjectRef,
  isModeratorRef,
  joined,
  participants,
  occupants,
}: UseReceivePermissionsParams) {
  const lastSigRef = useRef<string>("");

  useEffect(() => {
    const co = callObjectRef.current;
    if (!co || !joined || !isModeratorRef.current || participants.length === 0) {
      // Reset so a rejoin (new call object) re-applies even if the membership
      // signature happens to recur — the fresh room has no permissions yet.
      if (!joined) lastSigRef.current = "";
      return;
    }

    const sig = membershipSignature(participants, occupants);
    if (sig === lastSigRef.current) return; // membership unchanged → no SFU call
    lastSigRef.current = sig;

    const updates: Record<
      string,
      { updatePermissions: { canReceive: { base: boolean; byUserId: Record<string, boolean> } } }
    > = {};
    for (const viewer of participants) {
      // Skip our own session: an owner setting their *own* permissions is the
      // rare double-private-zone edge, and risking the whole batch on it isn't
      // worth it. Our own `canReceive` is baked at join. Crucially this loses no
      // privacy — hiding an occupant from a *gamer* is set on the gamer's
      // (remote) canReceive below, not ours.
      if (viewer.isLocal) continue;
      const blocked = new Set(blockedUserIdsFor(viewer.userId, occupants));
      const byUserId: Record<string, boolean> = {};
      for (const other of participants) {
        if (other.sessionId === viewer.sessionId) continue;
        // Explicit allow/deny for every peer — a full-state write, so an
        // occupant who just left flips back to `true` here rather than lingering
        // blocked (Daily merges provided keys, so omission wouldn't un-block).
        byUserId[other.userId] = !blocked.has(other.userId);
      }
      updates[viewer.sessionId] = { updatePermissions: { canReceive: { base: true, byUserId } } };
    }
    if (Object.keys(updates).length === 0) return; // only us connected — nothing to set

    try {
      co.updateParticipants(updates);
    } catch (err) {
      // A transient Daily error must never abort the call; the next change
      // re-applies the full projection anyway. Clear the cached signature so
      // that retry isn't skipped as a no-op.
      lastSigRef.current = "";
      console.error("[voice] failed to apply canReceive projection:", err);
    }
  }, [participants, occupants, joined, callObjectRef, isModeratorRef]);
}
