import { useCallback, useRef, useState } from "react";
import type { DailyCall } from "@daily-co/daily-js";
import { DEFAULT_ZONE_ID } from "@/lib/constants/voice-zones";
import type { AppMessage, ZoneUserData } from "./types";

interface UseZoneMembershipParams {
  callObjectRef: React.MutableRefObject<DailyCall | null>;
  /** Live mirror of whether the local user is a moderator (token `is_owner`). */
  isModeratorRef: React.MutableRefObject<boolean>;
  /** The local user's current zone — the single source of truth for audio
   *  routing, owned by the provider and shared with the audio pipeline. This
   *  hook is its sole writer: it updates the ref *synchronously* on a move,
   *  before calling `onChanged`, so routing re-evaluates against the new zone
   *  immediately instead of waiting for Daily to echo our `setUserData` back. */
  localZoneIdRef: React.MutableRefObject<string>;
  /** Re-route audio after a local change (move or broadcast toggle). On a move,
   *  `localZoneIdRef` is already updated by the time this runs. */
  onChanged: () => void;
}

/**
 * Normal-zone membership, synced through Daily `userData` instead of the old
 * peer-to-peer position handshake. Each client stamps `{ zoneId, broadcasting }`
 * onto its own participant; Daily hands that to every new joiner the instant
 * they connect and pushes later changes via `participant-updated`. See
 * src/components/voice/CLAUDE.md.
 *
 * This hook only moves a participant between *normal* zones. Placing someone
 * into a locked zone is a separate, mod-only flow: it writes a
 * `voice_private_zone_occupants` row (the authoritative privacy boundary) rather
 * than relying on `userData`, and privacy is enforced at the SFU via
 * `canReceive` — not a separate room. See the provider's `placeInPrivateZone`
 * and `use-receive-permissions.ts`.
 */
export function useZoneMembership({
  callObjectRef,
  isModeratorRef,
  localZoneIdRef,
  onChanged,
}: UseZoneMembershipParams) {
  const [currentZoneId, setCurrentZoneId] = useState<string>(DEFAULT_ZONE_ID);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // `broadcastingRef` mirrors the broadcast toggle so `writeUserData` always
  // serializes the current pair without a stale closure. The zone half lives in
  // the provider-owned `localZoneIdRef` (shared with the audio pipeline), which
  // this hook writes synchronously on a move.
  const broadcastingRef = useRef(false);

  /** Daily's `setUserData` replaces (not merges) userData, so always write the
   *  full pair. */
  const writeUserData = useCallback(() => {
    const co = callObjectRef.current;
    if (!co) return;
    const data: ZoneUserData = {
      zoneId: localZoneIdRef.current,
      broadcasting: broadcastingRef.current,
    };
    co.setUserData(data);
  }, [callObjectRef, localZoneIdRef]);

  const setLocalZone = useCallback(
    (zoneId: string) => {
      localZoneIdRef.current = zoneId;
      setCurrentZoneId(zoneId);
      writeUserData();
      onChanged();
    },
    [writeUserData, onChanged, localZoneIdRef],
  );

  /** Move self into a (non-locked) zone — tap or drag own avatar. */
  const moveSelfToZone = useCallback(
    (zoneId: string) => {
      if (!callObjectRef.current) return;
      setLocalZone(zoneId);
    },
    [callObjectRef, setLocalZone],
  );

  /** Moderator moves another participant. A client can't set another's
   *  userData, so we ask the target to move itself (it verifies we're an owner). */
  const moveParticipantToZone = useCallback(
    (targetSessionId: string, zoneId: string) => {
      const co = callObjectRef.current;
      if (!co || !isModeratorRef.current) return;
      const msg: AppMessage = { type: "moveUser", targetSessionId, zoneId };
      co.sendAppMessage(msg, targetSessionId);
    },
    [callObjectRef, isModeratorRef],
  );

  const toggleBroadcast = useCallback(() => {
    if (!callObjectRef.current || !isModeratorRef.current) return;
    broadcastingRef.current = !broadcastingRef.current;
    setIsBroadcasting(broadcastingRef.current);
    writeUserData();
    onChanged();
  }, [callObjectRef, isModeratorRef, writeUserData, onChanged]);

  /** Set the initial lobby userData on join so peers see us in the lobby. */
  const onJoined = useCallback(() => {
    localZoneIdRef.current = DEFAULT_ZONE_ID;
    broadcastingRef.current = false;
    setCurrentZoneId(DEFAULT_ZONE_ID);
    setIsBroadcasting(false);
    writeUserData();
  }, [writeUserData, localZoneIdRef]);

  /** Handle the moderator `moveUser` app message: if it targets us and the
   *  sender is a verified owner, move ourselves. */
  const onAppMessage = useCallback(
    (msg: AppMessage, fromId: string, co: DailyCall) => {
      if (msg.type !== "moveUser") return;
      const localSid = co.participants().local.session_id;
      if (msg.targetSessionId !== localSid) return;
      const sender = co.participants()[fromId];
      if (!sender.owner) return;
      setLocalZone(msg.zoneId);
    },
    [setLocalZone],
  );

  const reset = useCallback(() => {
    localZoneIdRef.current = DEFAULT_ZONE_ID;
    broadcastingRef.current = false;
    setCurrentZoneId(DEFAULT_ZONE_ID);
    setIsBroadcasting(false);
  }, [localZoneIdRef]);

  return {
    currentZoneId,
    isBroadcasting,
    moveSelfToZone,
    moveParticipantToZone,
    toggleBroadcast,
    onJoined,
    onAppMessage,
    reset,
  };
}
