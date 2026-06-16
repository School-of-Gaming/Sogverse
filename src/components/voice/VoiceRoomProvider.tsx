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
import { DEFAULT_ZONE_ID } from "@/lib/constants/voice-zones";
import { getClient } from "@/lib/supabase/client";
import { VoiceService } from "@/services/voice/voice.service";
import { VoiceZonesService } from "@/services/voice/voice-zones.service";
import type { VoiceZoneIcon, VoiceZoneColor } from "@/types";
import type {
  VoiceRoomContextValue,
  VoiceParticipant,
  AppMessage,
  VoiceRole,
  ZoneUserData,
  LockedMember,
} from "./hooks/types";
import { useAudioPipeline, type LocalAudioState } from "./hooks/use-audio-pipeline";
import { useZoneMembership } from "./hooks/use-zone-membership";
import { useZoneData } from "./hooks/use-zone-data";
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
  // The local user's profile id (decoded from the Daily token), for placement
  // rows. The current session window's open time (from the main-token
  // response), for stamping placements. Both persist across locked-room
  // switches within a session.
  const localUserIdRef = useRef<string | null>(null);
  const sessionOpensAtRef = useRef<string | null>(null);
  // Which locked zone's separate Daily room we're currently in (null = main
  // room). A ref for synchronous reads in moveSelfToZone + the switch guard,
  // mirrored to state for rendering.
  const lockedRoomZoneIdRef = useRef<string | null>(null);
  // Re-entrancy lock so overlapping placement events can't fire two switches.
  const switchInProgressRef = useRef(false);
  // userId → display name, accumulated from everyone we've seen in the main
  // room. Lets the blurred locked-zone roster show names for gamers who were
  // visible before a mod placed them (the common case) — they vanish from Daily
  // once in the separate room, so this is the only name source for outsiders.
  const nameCacheRef = useRef<Map<string, string>>(new Map());

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
  // Which locked zone's room we're in (null = main), mirrored from the ref.
  const [lockedRoomZoneId, setLockedRoomZoneId] = useState<string | null>(null);
  // Active while crossing the room boundary — drives the "Securing your
  // connection…" transition. `zoneId` is the locked zone being entered, or null
  // when returning to the main room.
  const [roomTransition, setRoomTransition] = useState<{ zoneId: string | null } | null>(null);
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

  // Live custom zones + locked placements from the DB (group rooms only).
  const { customZones, placements } = useZoneData(groupId);

  // Composed zone list: virtual lobby + 4 Yty + the group's DB custom zones.
  // Declared here (before moveSelfToZone) so the room-switch logic can read it.
  const zones = useMemo(() => composeZones(customZones, groupId), [customZones, groupId]);

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
        // Remember names so the locked-zone roster stays legible after a placed
        // gamer leaves the main room. Never deleted on leave — only on reset.
        if (mapped.userName) nameCacheRef.current.set(mapped.userId, mapped.userName);
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
    nameCacheRef.current = new Map();
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

        // We've arrived in the target room — clear any in-flight switch state.
        setRoomTransition(null);

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

  // --- Locked-zone room switching ---

  /**
   * Cross the room boundary: re-join either the main group room or a locked
   * zone's separate Daily room. Drives the "Securing your connection…"
   * transition (the deliberate ~1–2s reconnect that buys true isolation). The
   * re-entrancy lock + the caller's already-there guards keep overlapping
   * placement events from firing two switches.
   */
  const switchRoom = useCallback(
    async (target: { kind: "main" } | { kind: "locked"; zoneId: string }) => {
      if (!groupId || switchInProgressRef.current) return;
      switchInProgressRef.current = true;
      const targetZoneId = target.kind === "locked" ? target.zoneId : null;
      setRoomTransition({ zoneId: targetZoneId });
      try {
        const svc = new VoiceService(getClient());
        const res =
          target.kind === "locked"
            ? await svc.getLockedToken(groupId, target.zoneId)
            : await svc.getToken(groupId);
        lockedRoomZoneIdRef.current = targetZoneId;
        setLockedRoomZoneId(targetZoneId);
        // join() resets state and connects to the new room; handleJoined clears
        // the transition once we've actually arrived.
        await join(res.roomUrl, res.token);
      } catch {
        setRoomTransition(null);
      } finally {
        switchInProgressRef.current = false;
      }
    },
    [groupId, join],
  );

  /** Move self into a zone — a userData change for normal zones, a room switch
   *  for locked ones. Gamers can't self-enter a locked zone or self-exit one
   *  they've been placed in (that's mod-only); moderators move freely. */
  const moveSelfToZone = useCallback(
    (zoneId: string) => {
      const target = zones.find((z) => z.id === zoneId);
      if (!target) return;
      const inLocked = lockedRoomZoneIdRef.current !== null;

      // A gamer confined to a locked room can't self-move at all.
      if (inLocked && !isModeratorRef.current) return;

      if (target.isLocked) {
        if (!isModeratorRef.current) return; // gamers are placed, never self-enter
        if (lockedRoomZoneIdRef.current === zoneId) return; // already inside
        void switchRoom({ kind: "locked", zoneId });
        return;
      }

      // Normal zone. If we're currently in a locked room, return to main first,
      // then set the destination zone via userData.
      if (inLocked) {
        void switchRoom({ kind: "main" }).then(() => membership.moveSelfToZone(zoneId));
      } else {
        membership.moveSelfToZone(zoneId);
      }
    },
    [zones, switchRoom, membership],
  );

  // --- Locked placement (moderator) ---

  const placeInLockedZone = useCallback(
    async (gamerId: string, zoneId: string) => {
      const placedBy = localUserIdRef.current;
      const sessionOpensAt = sessionOpensAtRef.current;
      if (!groupId || !isModeratorRef.current || !placedBy || !sessionOpensAt) return;
      await new VoiceZonesService(getClient()).placeInLockedZone({
        zoneId,
        gamerId,
        groupId,
        placedBy,
        sessionOpensAt,
        // We've just seen the gamer in the main room (we're placing them), so
        // their name is in the cache — snapshot it onto the row for outsiders.
        gamerName: nameCacheRef.current.get(gamerId) ?? null,
      });
    },
    [groupId],
  );

  const removeFromLockedZone = useCallback(
    async (gamerId: string) => {
      if (!groupId || !isModeratorRef.current) return;
      await new VoiceZonesService(getClient()).removeFromLockedZone({ groupId, gamerId });
    },
    [groupId],
  );

  // --- Custom-zone management (moderator) ---

  const createZone = useCallback(
    async (input: { name: string; icon: VoiceZoneIcon; color: VoiceZoneColor; isLocked: boolean }) => {
      const createdBy = localUserIdRef.current;
      if (!groupId || !isModeratorRef.current || !createdBy) return;
      await new VoiceZonesService(getClient()).createZone({ groupId, createdBy, ...input });
    },
    [groupId],
  );

  const updateZone = useCallback(
    async (id: string, patch: { name?: string; icon?: VoiceZoneIcon; color?: VoiceZoneColor }) => {
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

  // Suppress a single noisy console.error that Daily's SDK emits from
  // inside `call-machine-object-bundle.js` whenever a participant is
  // ejected — for us, the expected end-of-session path. There is no
  // event handler, no SDK log level, and no Daily-side config that
  // disables it; the string-match patch is the canonical workaround
  // across the daily-js / Vapi ecosystem. Scoped to the provider's mount
  // lifetime so we don't touch console.error globally for the rest of the app.
  useEffect(() => {
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      const first = args[0];
      if (typeof first === "string" && first.includes("Meeting ended due to ejection")) {
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

  const participantsByZone = useMemo(() => {
    const map = new Map<string, VoiceParticipant[]>();
    for (const z of zones) map.set(z.id, []);
    for (const p of participants) {
      // While connected to a locked room, every Daily participant *is* in that
      // locked zone (they share the separate room) — their userData zone is
      // moot. In the main room, bucket by their self-reported zone, falling back
      // to the lobby if that zone was deleted (its occupants move to lobby).
      const zid = lockedRoomZoneId ?? (map.has(p.zoneId) ? p.zoneId : DEFAULT_ZONE_ID);
      const bucket = map.get(zid);
      if (bucket) bucket.push(p);
      else map.set(zid, [p]);
    }
    return map;
  }, [participants, zones, lockedRoomZoneId]);

  // When inside a locked room, that zone is the current one; otherwise the
  // userData-tracked zone within the main room.
  const currentZoneId = lockedRoomZoneId ?? membership.currentZoneId;

  // A placed gamer's client auto-confines: when its own placement row appears
  // (realtime), switch into the locked room; when it's removed, return to main.
  // Moderators are exempt — they move in and out freely via moveSelfToZone.
  const localUserId = participants.find((p) => p.isLocal)?.userId ?? null;
  useEffect(() => {
    if (!joined || !groupId || isModerator || !localUserId) return;
    const myPlacement = placements.find(
      (p) =>
        p.gamer_id === localUserId &&
        isCurrentSessionPlacement(p.session_opens_at, sessionOpensAtRef.current),
    );
    const target = myPlacement?.zone_id ?? null;
    if (target !== lockedRoomZoneId && !switchInProgressRef.current) {
      void switchRoom(target ? { kind: "locked", zoneId: target } : { kind: "main" });
    }
  }, [joined, groupId, isModerator, localUserId, placements, lockedRoomZoneId, switchRoom]);

  // If the zone we're standing in gets deleted out from under us, fall back to
  // the lobby (mirrors the occupant remap in participantsByZone, but updates our
  // own userData so peers see the move too). Skipped while in a locked room.
  useEffect(() => {
    if (!joined || lockedRoomZoneId) return;
    if (!zones.some((z) => z.id === membership.currentZoneId)) {
      membership.moveSelfToZone(DEFAULT_ZONE_ID);
    }
  }, [joined, zones, lockedRoomZoneId, membership]);

  // Outsider view of locked zones: who's inside, from the DB placement rows
  // (the viewer isn't connected to the separate locked room).
  const lockedRoster = useMemo(() => {
    const map = new Map<string, LockedMember[]>();
    for (const p of placements) {
      // Only the current session's placements are live (prior-session rows are
      // reaped server-side on join, but guard here so they never flash).
      if (!isCurrentSessionPlacement(p.session_opens_at, sessionOpensAtRef.current)) continue;
      const bucket = map.get(p.zone_id);
      const member: LockedMember = {
        gamerId: p.gamer_id,
        // The row's snapshot is the durable source (works for late joiners); the
        // live cache is a fallback for any older row that predates the snapshot.
        name: p.gamer_name ?? nameCacheRef.current.get(p.gamer_id),
      };
      if (bucket) bucket.push(member);
      else map.set(p.zone_id, [member]);
    }
    return map;
    // `participants` is a dep so the memo re-runs once a just-seen gamer's name
    // has landed in the cache (the cache itself is a ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nameCacheRef is a ref; participants drives the refresh
  }, [placements, participants]);

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
      lockedRoster,
      moveSelfToZone,
      moveParticipantToZone: membership.moveParticipantToZone,
      placeInLockedZone,
      removeFromLockedZone,
      createZone,
      updateZone,
      deleteZone,
      roomTransition,
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
    [joined, joining, callObject, localSessionId, localRole, isModerator, groupId, participants, zones, customZones, currentZoneId, participantsByZone, lockedRoster, moveSelfToZone, membership.moveParticipantToZone, placeInLockedZone, removeFromLockedZone, createZone, updateZone, deleteZone, roomTransition, micOn, cameraOn, cameraAllowed, toggleMic, toggleCamera, screenShare.screenSharerSessionId, screenShare.canScreenShare, screenShare.isScreenSharing, screenShare.startScreenShare, screenShare.stopScreenShare, membership.isBroadcasting, membership.toggleBroadcast, isDeafened, toggleDeafen, micDevices.audioInputs, micDevices.currentAudioInputId, micDevices.setAudioInput, micDevices.micPermission, moderator.localLocks, moderator.lockStates, moderator.muteParticipant, moderator.lockParticipant, audio.getAnalyser, chat.messages, chat.sendChatMessage, join, leave],
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
