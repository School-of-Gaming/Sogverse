"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DailyCall, DailyParticipant } from "@daily-co/daily-js";
import { parseUserName } from "@/lib/voice/user-name";
import { composeZones } from "@/lib/voice/zone-composition";
import { isCurrentSessionPlacement } from "@/lib/voice/locked-session";
import type { PrivateOccupant } from "@/lib/voice/receive-permissions";
import { DEFAULT_ZONE_ID } from "@/lib/constants/voice-zones";
import { getClient } from "@/lib/supabase/client";
import { VoiceZonesService } from "@/services/voice/voice-zones.service";
import type { VoiceZoneIcon, VoiceZoneColor } from "@/types";
import type {
  VoiceRoomContextValue,
  VoiceParticipant,
  AppMessage,
  VoiceRole,
  ZoneUserData,
} from "./hooks/types";
import { useAudioPipeline, type LocalAudioState } from "./hooks/use-audio-pipeline";
import { useZoneMembership } from "./hooks/use-zone-membership";
import { useZoneData } from "./hooks/use-zone-data";
import { useReceivePermissions } from "./hooks/use-receive-permissions";
import { useMicDevices } from "./hooks/use-mic-devices";
import { useScreenShare } from "./hooks/use-screen-share";
import { useModeratorControls } from "./hooks/use-moderator-controls";
import { useChat } from "./hooks/use-chat";
import { useWakeLock } from "./hooks/use-wake-lock";

// Re-export types so existing imports from VoiceRoomProvider still work
export type { VoiceParticipant, LockState, ChatMessage } from "./hooks/types";

// Exported so the /admin/ui-components style guide can render the voice UI with
// a hand-built mock context value (no live Daily call). The components are pure
// consumers of this context, so a fixture value drives them identically — which
// doubles as a separation-of-concerns check: if the UI demos cleanly here,
// business logic hasn't leaked into the view.
export const VoiceRoomContext = createContext<VoiceRoomContextValue | null>(null);

// ---------- Helpers ----------

/** Decode the `{ zoneId, broadcasting }` we stamp onto Daily `userData`,
 *  tolerating absent/garbage data (defaults to the lobby, not broadcasting). */
function parseZoneUserData(userData: unknown): ZoneUserData {
  if (typeof userData !== "object" || userData === null) {
    return { zoneId: DEFAULT_ZONE_ID, broadcasting: false };
  }
  const zoneId =
    "zoneId" in userData && typeof userData.zoneId === "string"
      ? userData.zoneId
      : DEFAULT_ZONE_ID;
  const broadcasting = "broadcasting" in userData && userData.broadcasting === true;
  return { zoneId, broadcasting };
}

function mapParticipant(p: DailyParticipant, activeSpeakerId: string | null): VoiceParticipant {
  const { userId, role, displayName, minecraftUsername, minecraftUuid } = parseUserName(p.user_name);
  const { zoneId, broadcasting } = parseZoneUserData(p.userData);

  return {
    sessionId: p.session_id,
    userId: userId || p.session_id,
    role,
    userName: displayName,
    minecraftUsername,
    minecraftUuid,
    audioOn: !p.audio ? false : p.tracks.audio.state === "playable",
    videoOn: !p.video ? false : p.tracks.video.state === "playable",
    screenShareOn: p.tracks.screenVideo.state === "playable",
    isLocal: p.local,
    isOwner: p.owner,
    isSpeaking: p.session_id === activeSpeakerId && Boolean(p.audio) && p.tracks.audio.state === "playable",
    zoneId,
    isBroadcasting: broadcasting,
  };
}

function isModeratorRole(role: VoiceRole): boolean {
  return role === "admin" || role === "gedu";
}

// ---------- Provider ----------

interface VoiceRoomProviderProps {
  children: React.ReactNode;
  /** A `product_groups.id` for scheduled group rooms, or `null` for instant
   *  rooms (no group → custom/locked zone features are disabled). */
  groupId?: string | null;
}

export function VoiceRoomProvider({ children, groupId = null }: VoiceRoomProviderProps) {
  // --- Shared refs (owned by provider, passed to hooks) ---
  const callObjectRef = useRef<DailyCall | null>(null);
  // Per-remote zone state, mirrored from Daily userData each updateParticipants.
  const zoneInfoRef = useRef<Map<string, ZoneUserData>>(new Map());
  // The local listener's audio-routing state (zone + deafen).
  const localAudioStateRef = useRef<LocalAudioState>({ zoneId: DEFAULT_ZONE_ID, deafened: false });
  // Live mirror of mod status for hooks that verify it synchronously.
  const isModeratorRef = useRef(false);
  // The local user's profile id (decoded from the Daily token), for occupancy
  // rows. The current session window's open time (from the token response), for
  // stamping them. Both persist for the session.
  const localUserIdRef = useRef<string | null>(null);
  const sessionOpensAtRef = useRef<string | null>(null);
  // Synchronous mirror of the current-session private-zone occupancy, so
  // moveSelfToZone can read "am I a confined gamer" without a stale closure.
  const occupantsRef = useRef<PrivateOccupant[]>([]);

  // --- Core call state ---
  const [callObject, setCallObject] = useState<DailyCall | null>(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraAllowed, setCameraAllowed] = useState(false);
  const [localRole, setLocalRole] = useState<VoiceRole>("gamer");
  const [isDeafened, setIsDeafened] = useState(false);
  const activeSpeakerIdRef = useRef<string | null>(null);
  // Synchronous gate — events like track-started fire before joined-meeting,
  // when co.participants().local doesn't exist yet. updateParticipants skips
  // until this is true; handleJoined calls it to catch up on current state.
  const joinedRef = useRef(false);

  // --- Compose hooks ---

  const audio = useAudioPipeline({ callObjectRef, zoneInfoRef, localAudioStateRef });

  const membership = useZoneMembership({
    callObjectRef,
    isModeratorRef,
    onChanged: audio.updateAudioRouting,
  });

  const localSessionId = participants.find((p) => p.isLocal)?.sessionId ?? null;
  const screenShare = useScreenShare({ callObjectRef, localRole, localSessionId });

  // Keep the screen awake while in a voice call.
  useWakeLock();

  const moderator = useModeratorControls({
    callObjectRef,
    setMicOn,
    setCameraOn,
  });

  const chat = useChat({ callObjectRef });

  const micDevices = useMicDevices({ callObjectRef, joined });

  // Live custom zones + private-zone occupancy from the DB (group rooms only).
  const { customZones, occupants } = useZoneData(groupId);

  // Composed zone list: virtual lobby + 4 Yty + the group's DB custom zones.
  const zones = useMemo(() => composeZones(customZones, groupId), [customZones, groupId]);

  // Current-session private-zone occupancy, projected to the `canReceive` shape.
  // Prior-session rows are reaped server-side on join, but filter here too so a
  // straggler never affects routing/permissions/rendering before the prune.
  const privateOccupants = useMemo<PrivateOccupant[]>(
    () =>
      occupants
        .filter((o) =>
          isCurrentSessionPlacement(o.session_opens_at, sessionOpensAtRef.current),
        )
        .map((o) => ({ userId: o.user_id, zoneId: o.zone_id })),
    [occupants],
  );
  occupantsRef.current = privateOccupants;

  // --- Participant management ---

  const updateParticipants = useCallback((co: DailyCall) => {
    if (!joinedRef.current) return;

    const pMap = co.participants();
    const list: VoiceParticipant[] = [];
    const zoneInfo = new Map<string, ZoneUserData>();
    for (const p of Object.values(pMap)) {
      // parseUserName throws on a malformed token. Our routes are the only
      // writers, so that's a bug worth surfacing — but isolate it per peer:
      // one bad remote token must skip that participant, never abort the loop
      // and blank the whole room for everyone else.
      try {
        const mapped = mapParticipant(p, activeSpeakerIdRef.current);
        list.push(mapped);
        zoneInfo.set(p.session_id, { zoneId: mapped.zoneId, broadcasting: mapped.isBroadcasting });
      } catch (err) {
        console.error(
          `[voice] skipping participant ${p.session_id} with malformed user_name:`,
          err,
        );
      }
    }
    zoneInfoRef.current = zoneInfo;
    setParticipants(list);

    const local = pMap.local;
    setMicOn(local.tracks.audio.state === "playable");
    setCameraOn(local.tracks.video.state === "playable");
    // Keep the local audio-routing zone in sync with our own userData.
    localAudioStateRef.current = {
      zoneId: parseZoneUserData(local.userData).zoneId,
      deafened: localAudioStateRef.current.deafened,
    };

    screenShare.detectScreenSharer(list);
    void audio.manageAudioNodes(co);
    audio.manageLocalAnalyser(co);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- individual methods are stable useCallback refs; adding the parent objects would re-create this callback on every render
  }, [screenShare.detectScreenSharer, audio.manageAudioNodes, audio.manageLocalAnalyser]);

  // --- App message dispatch ---

  const handleAppMessage = useCallback((event: { data: AppMessage; fromId: string }) => {
    const co = callObjectRef.current;
    if (!co) return;
    const { data: msg, fromId } = event;

    // Lock sync: each peer self-reports their own lock state on join.
    // The type carries a single LockState — a peer can only claim their own.
    // Note: a malicious peer could lie about being unlocked. This is cosmetic
    // only — actual enforcement is via Daily.co's canSend SFU permissions.
    if (msg.type === "lockSync") {
      moderator.onLockStatesReceived(fromId, msg.lock);
      return;
    }

    // Chat: append to the ephemeral in-memory log. Sender name is resolved
    // from Daily's verified fromId inside the hook, not the payload.
    if (msg.type === "chatMessage") {
      chat.onChatMessage(msg, fromId, co);
      return;
    }

    // Moderator asking us to move zones — verified-owner-gated inside the hook.
    if (msg.type === "moveUser") {
      membership.onAppMessage(msg, fromId, co);
      return;
    }

    // Moderator messages: moderatorMute, moderatorLock
    moderator.onAppMessage(msg, fromId, co);
  }, [membership, moderator, chat]);

  // --- Deafen (moderator-only): silences all remotes locally ---

  const toggleDeafen = useCallback(() => {
    if (!isModeratorRef.current) return;
    setIsDeafened((prev) => {
      const next = !prev;
      localAudioStateRef.current = { ...localAudioStateRef.current, deafened: next };
      audio.updateAudioRouting();
      return next;
    });
  }, [audio]);

  // --- Shared reset ---

  const resetState = useCallback(() => {
    joinedRef.current = false;
    isModeratorRef.current = false;
    zoneInfoRef.current = new Map();
    localAudioStateRef.current = { zoneId: DEFAULT_ZONE_ID, deafened: false };
    setJoined(false);
    setParticipants([]);
    setMicOn(true);
    setCameraOn(false);
    setCameraAllowed(false);
    setLocalRole("gamer");
    setIsDeafened(false);
    activeSpeakerIdRef.current = null;
    membership.reset();
    moderator.reset();
    screenShare.reset();
    audio.reset();
    chat.reset();
  }, [membership, moderator, screenShare, audio, chat]);

  // --- Join / Leave ---

  const join = useCallback(
    async (roomUrl: string, token: string, meta?: { sessionOpensAt?: string }) => {
      if (meta?.sessionOpensAt) sessionOpensAtRef.current = meta.sessionOpensAt;
      if (callObjectRef.current) {
        await callObjectRef.current.destroy();
      }
      resetState();

      setJoining(true);
      audio.createAudioContext();

      const Daily = (await import("@daily-co/daily-js")).default;
      // Initial mic/camera state is set by the meeting token's
      // `start_video_off` / `start_audio_off` properties (see
      // `createMeetingToken`). Token-level settings override anything passed
      // here, so we deliberately don't duplicate them on the call object —
      // the token is the single source of truth.
      const co = Daily.createCallObject({
        audioSource: true,
        videoSource: true,
        dailyConfig: {
          // Use <script> element loader instead of fetch+eval, so the call object
          // bundle is allowed by our nonce-based CSP ('strict-dynamic').
          avoidEval: true,
        },
      });

      callObjectRef.current = co;
      setCallObject(co);

      const handleJoined = () => {
        joinedRef.current = true;
        setJoined(true);
        setJoining(false);
        setCameraAllowed(true);

        const local = co.participants().local;
        const parsed = parseUserName(local.user_name);
        setLocalRole(parsed.role);
        isModeratorRef.current = isModeratorRole(parsed.role);
        localUserIdRef.current = parsed.userId || local.session_id;

        // Stamp our initial lobby zone onto userData so peers place us
        // immediately, then derive the list.
        membership.onJoined();
        updateParticipants(co);
      };

      const handleParticipantJoined = (event: { participant: DailyParticipant }) => {
        // Guard against events on a stale call object (e.g., rapid rejoin).
        // Daily guarantees joined-meeting fires before any participant-joined.
        if (!joinedRef.current) return;
        const newPeerSid = event.participant.session_id;
        const localSid = co.participants().local.session_id;

        // Self-report our lock state so the new peer's moderator UI is accurate.
        // Each peer only claims their own state — real enforcement is Daily's
        // canSend permission at the SFU. (Zone membership needs no such message:
        // Daily hands our userData to the new joiner automatically.)
        const myLocks = moderator.lockStateRef.current.get(localSid);
        if (myLocks && (myLocks.audio || myLocks.video)) {
          const lockMsg: AppMessage = { type: "lockSync", lock: myLocks };
          co.sendAppMessage(lockMsg, newPeerSid);
        }

        updateParticipants(co);
      };

      const handleParticipantUpdate = () => updateParticipants(co);
      const handleTrackStarted = () => updateParticipants(co);

      const handleParticipantLeft = (event: { participant: DailyParticipant }) => {
        const sid = event.participant.session_id;
        moderator.onParticipantLeft(sid);
        audio.onParticipantLeft(sid);
        updateParticipants(co);
      };

      // Daily fires `left-meeting` for both voluntary and involuntary
      // disconnects (token/room exp, network drop, mod-ended call). The
      // voluntary path (`leave()`) destroys the call object and nulls
      // the ref before us, so this handler runs as a no-op for that
      // case. For the involuntary paths the ref is still live — we
      // mirror the voluntary cleanup so post-eject reads of
      // `callObjectRef.current` short-circuit naturally.
      const handleLeft = () => {
        if (callObjectRef.current) {
          callObjectRef.current.destroy().catch(() => {});
          callObjectRef.current = null;
          setCallObject(null);
        }
        resetState();
      };

      const handleActiveSpeakerChange = (event: { activeSpeaker: { peerId: string } }) => {
        activeSpeakerIdRef.current = event.activeSpeaker.peerId;
        updateParticipants(co);
      };

      co.on("joined-meeting", handleJoined);
      co.on("participant-joined", handleParticipantJoined);
      co.on("participant-left", handleParticipantLeft);
      co.on("participant-updated", handleParticipantUpdate);
      co.on("track-started", handleTrackStarted);
      co.on("active-speaker-change", handleActiveSpeakerChange);
      co.on("left-meeting", handleLeft);
      co.on("app-message", handleAppMessage);

      await co.join({ url: roomUrl, token });
    },
    [updateParticipants, handleAppMessage, resetState, audio, membership, moderator],
  );

  const leave = useCallback(async () => {
    const co = callObjectRef.current;
    if (!co) return;
    // Null the ref first so the `left-meeting` event fired during `co.leave()`
    // is a no-op in `handleLeft`. Otherwise `handleLeft` destroys + nulls the
    // ref mid-await and the `destroy()` below crashes on null.
    callObjectRef.current = null;
    setCallObject(null);
    await co.leave();
    await co.destroy();
    resetState();
  }, [resetState]);

  // --- Private-zone occupancy (moderator writes) ---

  /**
   * Record a user as occupying a private (locked) zone — the server-readable,
   * mod-authored privacy boundary that the token bake + the `canReceive`
   * projection read. One method, two write-paths: a mod placing a *gamer*
   * (`userId` = the gamer) and a mod recording *their own* entry (`userId` =
   * self). No Daily room switch — privacy is enforced by `canReceive` in the one
   * shared room.
   */
  const placeInPrivateZone = useCallback(
    async (userId: string, zoneId: string) => {
      const placedBy = localUserIdRef.current;
      const sessionOpensAt = sessionOpensAtRef.current;
      if (!groupId || !isModeratorRef.current || !placedBy || !sessionOpensAt) return;
      await new VoiceZonesService(getClient()).occupyPrivateZone({
        zoneId,
        userId,
        groupId,
        placedBy,
        sessionOpensAt,
      });
    },
    [groupId],
  );

  /** Clear a user's private-zone occupancy (a mod freeing a placed gamer, or a
   *  mod leaving a private zone they walked into). */
  const removeFromPrivateZone = useCallback(
    async (userId: string) => {
      if (!groupId || !isModeratorRef.current) return;
      await new VoiceZonesService(getClient()).vacatePrivateZone({ groupId, userId });
    },
    [groupId],
  );

  /**
   * Move self into a zone. One Daily room now, so this is always a `userData`
   * change (audio routing + rendering) — never a reconnect. Entering or leaving
   * a *private* zone additionally writes/clears the mover's own occupancy row,
   * which (re)applies the SFU `canReceive` boundary for everyone via the
   * projection. Gamers can't self-enter a private zone, and a confined gamer
   * can't self-leave one — both moderator-only.
   */
  const moveSelfToZone = useCallback(
    (zoneId: string) => {
      const target = zones.find((z) => z.id === zoneId);
      if (!target) return;
      const myUserId = localUserIdRef.current;
      const isMod = isModeratorRef.current;
      const iAmOccupant =
        !!myUserId && occupantsRef.current.some((o) => o.userId === myUserId);

      if (target.isLocked) {
        if (!isMod || !myUserId) return; // gamers are placed, never self-enter
        membership.moveSelfToZone(zoneId);
        void placeInPrivateZone(myUserId, zoneId);
        return;
      }

      // Normal zone. A confined gamer can't self-move out (mod-only).
      if (!isMod && iAmOccupant) return;
      const leavingPrivate = zones.find((z) => z.id === membership.zoneIdRef.current)?.isLocked;
      membership.moveSelfToZone(zoneId);
      if (isMod && myUserId && leavingPrivate) void removeFromPrivateZone(myUserId);
    },
    [zones, membership, placeInPrivateZone, removeFromPrivateZone],
  );

  // --- Custom-zone management (moderator) ---

  const createZone = useCallback(
    async (input: { name: string | null; icon: VoiceZoneIcon; color: VoiceZoneColor; isLocked: boolean }) => {
      const createdBy = localUserIdRef.current;
      if (!groupId || !isModeratorRef.current || !createdBy) return;
      await new VoiceZonesService(getClient()).createZone({ groupId, createdBy, ...input });
    },
    [groupId],
  );

  const updateZone = useCallback(
    async (id: string, patch: { name?: string | null; icon?: VoiceZoneIcon; color?: VoiceZoneColor }) => {
      if (!isModeratorRef.current) return;
      await new VoiceZonesService(getClient()).updateZone(id, patch);
    },
    [],
  );

  const deleteZone = useCallback(async (id: string) => {
    if (!isModeratorRef.current) return;
    await new VoiceZonesService(getClient()).deleteZone(id);
  }, []);

  // --- Lock-aware toggles ---

  const toggleMic = useCallback(() => {
    if (!callObjectRef.current) return;
    if (moderator.localLocksRef.current.audio && !micOn) return;
    const newState = !micOn;
    callObjectRef.current.setLocalAudio(newState);
    setMicOn(newState);
  }, [micOn, moderator.localLocksRef]);

  const toggleCamera = useCallback(async () => {
    if (!callObjectRef.current || !cameraAllowed) return;
    if (moderator.localLocksRef.current.video && !cameraOn) return;
    const newState = !cameraOn;
    try {
      await callObjectRef.current.setLocalVideo(newState);
      setCameraOn(newState);
    } catch {
      // Camera permission denied or device unavailable
    }
  }, [cameraOn, cameraAllowed, moderator.localLocksRef]);

  // Suppress the few noisy console.error lines Daily's SDK emits from inside
  // `call-machine-object-bundle.js` for flows that are normal for us, not errors:
  //   - "Meeting ended due to ejection" — our expected end-of-session path.
  //   - "Error starting ScreenShare … blocked-by-browser" — the user cancelled
  //     (or the browser blocked) the screen-share picker, a normal user flow. The
  //     startScreenShare() rejection is already caught in use-screen-share.ts, but
  //     Daily logs this separately from inside the bundle, so the catch there
  //     can't reach it. Matched on `blocked-by-browser` so a genuine screen-share
  //     failure still surfaces.
  // There is no event handler, SDK log level, or Daily-side config that disables
  // these; the string-match patch is the canonical workaround across the daily-js
  // / Vapi ecosystem. Scoped to the provider's mount lifetime so we don't touch
  // console.error globally for the rest of the app.
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      const text = args
        .map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : ""))
        .join(" ");
      if (text.includes("Meeting ended due to ejection")) return;
      if (text.includes("Error starting ScreenShare") && text.includes("blocked-by-browser")) {
        return;
      }
      originalError.apply(console, args);
    };
    return () => {
      console.error = originalError;
    };
  }, []);

  // Clean up call object on unmount.
  // Audio and membership hooks handle their own cleanup via internal useEffects.
  useEffect(() => {
    return () => {
      if (callObjectRef.current) {
        callObjectRef.current.leave().catch(() => {});
        callObjectRef.current.destroy().catch(() => {});
      }
    };
  }, []);

  // --- Derived view state ---

  const isModerator = isModeratorRole(localRole);

  const localUserId = participants.find((p) => p.isLocal)?.userId ?? null;

  // Owners enforce the private-zone `canReceive` boundary live on everyone
  // already connected; new joiners get the same projection baked into their
  // token server-side. Non-owners' effect is a no-op (they can't set perms).
  useReceivePermissions({
    callObjectRef,
    isModeratorRef,
    joined,
    participants,
    occupants: privateOccupants,
  });

  const participantsByZone = useMemo(() => {
    const occupancyByUser = new Map(privateOccupants.map((o) => [o.userId, o.zoneId]));
    const map = new Map<string, VoiceParticipant[]>();
    for (const z of zones) map.set(z.id, []);
    for (const p of participants) {
      // A participant in a private zone is bucketed by their *occupancy* row —
      // the authoritative, mod-written boundary — so a gamer can't fake their
      // way out by editing their own userData. Otherwise bucket by self-reported
      // userData zone, falling back to the lobby if that zone was deleted.
      const zid =
        occupancyByUser.get(p.userId) ?? (map.has(p.zoneId) ? p.zoneId : DEFAULT_ZONE_ID);
      const bucket = map.get(zid);
      if (bucket) bucket.push(p);
      else map.set(zid, [p]);
    }
    return map;
  }, [participants, zones, privateOccupants]);

  // The local user's current zone: their occupancy row if they're in a private
  // zone (authoritative), else their self-reported userData zone.
  const currentZoneId =
    (localUserId
      ? privateOccupants.find((o) => o.userId === localUserId)?.zoneId
      : undefined) ?? membership.currentZoneId;

  // A placed gamer's client auto-confines: pinned into its occupancy zone when a
  // row appears (realtime), released to the lobby when it's gone. Privacy itself
  // is enforced by `canReceive` (owner-set) regardless — this just keeps the
  // gamer's rendered/audio zone honest. Moderator-exempt (they move freely via
  // moveSelfToZone). Discriminating on "currently standing in a private zone"
  // (not "occupancy just disappeared") avoids racing a mod's free-then-move,
  // whose `moveUser` already lands the gamer in a normal zone.
  useEffect(() => {
    if (!joined || !groupId || isModerator || !localUserId) return;
    const myZone =
      privateOccupants.find((o) => o.userId === localUserId)?.zoneId ?? null;
    const standingInPrivate = zones.find((z) => z.id === membership.currentZoneId)?.isLocked;
    if (myZone) {
      if (membership.currentZoneId !== myZone) membership.moveSelfToZone(myZone);
    } else if (standingInPrivate) {
      membership.moveSelfToZone(DEFAULT_ZONE_ID);
    }
  }, [joined, groupId, isModerator, localUserId, privateOccupants, zones, membership]);

  // If the zone we're standing in gets deleted out from under us, fall back to
  // the lobby (mirrors the occupant remap in participantsByZone, but updates our
  // own userData so peers see the move too). A private zone's deletion cascades
  // its occupancy rows, so the projection un-blocks automatically.
  useEffect(() => {
    if (!joined) return;
    if (!zones.some((z) => z.id === membership.currentZoneId)) {
      membership.moveSelfToZone(DEFAULT_ZONE_ID);
    }
  }, [joined, zones, membership]);

  // --- Context ---

  const contextValue = useMemo<VoiceRoomContextValue>(
    () => ({
      joined,
      joining,
      callObject,
      localSessionId,
      localRole,
      isModerator,
      groupId,
      participants,
      zones,
      customZones,
      currentZoneId,
      participantsByZone,
      moveSelfToZone,
      moveParticipantToZone: membership.moveParticipantToZone,
      placeInPrivateZone,
      removeFromPrivateZone,
      createZone,
      updateZone,
      deleteZone,
      micOn,
      cameraOn,
      cameraAllowed,
      toggleMic,
      toggleCamera,
      screenSharerSessionId: screenShare.screenSharerSessionId,
      canScreenShare: screenShare.canScreenShare,
      isScreenSharing: screenShare.isScreenSharing,
      startScreenShare: screenShare.startScreenShare,
      stopScreenShare: screenShare.stopScreenShare,
      isBroadcasting: membership.isBroadcasting,
      toggleBroadcast: membership.toggleBroadcast,
      isDeafened,
      toggleDeafen,
      audioInputs: micDevices.audioInputs,
      currentAudioInputId: micDevices.currentAudioInputId,
      setAudioInput: micDevices.setAudioInput,
      micPermission: micDevices.micPermission,
      localLocks: moderator.localLocks,
      lockStates: moderator.lockStates,
      muteParticipant: moderator.muteParticipant,
      lockParticipant: moderator.lockParticipant,
      getAnalyser: audio.getAnalyser,
      messages: chat.messages,
      sendChatMessage: chat.sendChatMessage,
      join,
      leave,
    }),
    [joined, joining, callObject, localSessionId, localRole, isModerator, groupId, participants, zones, customZones, currentZoneId, participantsByZone, moveSelfToZone, membership.moveParticipantToZone, placeInPrivateZone, removeFromPrivateZone, createZone, updateZone, deleteZone, micOn, cameraOn, cameraAllowed, toggleMic, toggleCamera, screenShare.screenSharerSessionId, screenShare.canScreenShare, screenShare.isScreenSharing, screenShare.startScreenShare, screenShare.stopScreenShare, membership.isBroadcasting, membership.toggleBroadcast, isDeafened, toggleDeafen, micDevices.audioInputs, micDevices.currentAudioInputId, micDevices.setAudioInput, micDevices.micPermission, moderator.localLocks, moderator.lockStates, moderator.muteParticipant, moderator.lockParticipant, audio.getAnalyser, chat.messages, chat.sendChatMessage, join, leave],
  );

  return (
    <VoiceRoomContext.Provider value={contextValue}>
      {children}
    </VoiceRoomContext.Provider>
  );
}

export function useVoiceRoom() {
  const ctx = useContext(VoiceRoomContext);
  if (!ctx) {
    throw new Error("useVoiceRoom must be used within VoiceRoomProvider");
  }
  return ctx;
}
