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
import { DEFAULT_ZONE_ID } from "@/lib/constants/voice-zones";
import type {
  VoiceRoomContextValue,
  VoiceParticipant,
  AppMessage,
  VoiceRole,
  ZoneUserData,
} from "./hooks/types";
import { useAudioPipeline, type LocalAudioState } from "./hooks/use-audio-pipeline";
import { useZoneMembership } from "./hooks/use-zone-membership";
import { useScreenShare } from "./hooks/use-screen-share";
import { useModeratorControls } from "./hooks/use-moderator-controls";
import { useChat } from "./hooks/use-chat";
import { useWakeLock } from "./hooks/use-wake-lock";

// Re-export types so existing imports from VoiceRoomProvider still work
export type { VoiceParticipant, LockState, ChatMessage } from "./hooks/types";

const VoiceRoomContext = createContext<VoiceRoomContextValue | null>(null);

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
    async (roomUrl: string, token: string) => {
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
        const role = parseUserName(local.user_name).role;
        setLocalRole(role);
        isModeratorRef.current = isModeratorRole(role);

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

  // Custom zones come from the DB in a later PR; for now the list is the
  // virtual lobby + 4 Yty zones (instant rooms only ever get these).
  const zones = useMemo(() => composeZones(null, groupId), [groupId]);

  const participantsByZone = useMemo(() => {
    const map = new Map<string, VoiceParticipant[]>();
    for (const z of zones) map.set(z.id, []);
    for (const p of participants) {
      const bucket = map.get(p.zoneId);
      if (bucket) bucket.push(p);
      else map.set(p.zoneId, [p]);
    }
    return map;
  }, [participants, zones]);

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
      currentZoneId: membership.currentZoneId,
      participantsByZone,
      moveSelfToZone: membership.moveSelfToZone,
      moveParticipantToZone: membership.moveParticipantToZone,
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
    [joined, joining, callObject, localSessionId, localRole, isModerator, groupId, participants, zones, membership.currentZoneId, participantsByZone, membership.moveSelfToZone, membership.moveParticipantToZone, micOn, cameraOn, cameraAllowed, toggleMic, toggleCamera, screenShare.screenSharerSessionId, screenShare.canScreenShare, screenShare.isScreenSharing, screenShare.startScreenShare, screenShare.stopScreenShare, membership.isBroadcasting, membership.toggleBroadcast, isDeafened, toggleDeafen, moderator.localLocks, moderator.lockStates, moderator.muteParticipant, moderator.lockParticipant, audio.getAnalyser, chat.messages, chat.sendChatMessage, join, leave],
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
