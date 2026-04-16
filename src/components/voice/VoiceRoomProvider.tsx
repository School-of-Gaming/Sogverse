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
import type {
  DailyCall,
  DailyParticipant,
} from "@daily-co/daily-js";
import type { UserRole } from "@/types";
import type { SpatialPosition } from "@/lib/constants/spatial";
import type { VoiceRoomContextValue, VoiceParticipant, AppMessage } from "./hooks/types";
import { useAudioPipeline } from "./hooks/use-audio-pipeline";
import { useSpatialPositions } from "./hooks/use-spatial-positions";
import { useScreenShare } from "./hooks/use-screen-share";
import { useModeratorControls } from "./hooks/use-moderator-controls";
import { useWakeLock } from "./hooks/use-wake-lock";

// Re-export types so existing imports from VoiceRoomProvider still work
export type { VoiceParticipant, LockState } from "./hooks/types";

const VoiceRoomContext = createContext<VoiceRoomContextValue | null>(null);

// ---------- Helpers ----------

function mapParticipant(p: DailyParticipant, activeSpeakerId: string | null, position: SpatialPosition): VoiceParticipant {
  const raw = p.user_name || "";
  const parts = raw.split("|");
  const userId = parts[0] || p.session_id;
  const role = parts[1] as UserRole;
  const userName = parts.slice(2).join("|") || "Unknown";

  return {
    sessionId: p.session_id,
    userId,
    role,
    userName,
    audioOn: !p.audio ? false : p.tracks.audio.state === "playable",
    videoOn: !p.video ? false : p.tracks.video.state === "playable",
    screenShareOn: p.tracks.screenVideo.state === "playable",
    isLocal: p.local,
    isOwner: p.owner,
    isSpeaking: p.session_id === activeSpeakerId && Boolean(p.audio) && p.tracks.audio.state === "playable",
    position,
  };
}

// ---------- Provider ----------

export function VoiceRoomProvider({ children }: { children: React.ReactNode }) {
  // --- Shared refs (owned by provider, passed to hooks) ---
  const callObjectRef = useRef<DailyCall | null>(null);
  const positionsRef = useRef<Map<string, SpatialPosition>>(new Map());

  // --- Core call state ---
  const [callObject, setCallObject] = useState<DailyCall | null>(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraAllowed, setCameraAllowed] = useState(false);
  const [localRole, setLocalRole] = useState<UserRole>("gamer");
  const activeSpeakerIdRef = useRef<string | null>(null);
  // Synchronous gate — events like track-started fire before joined-meeting,
  // when co.participants().local doesn't exist yet. updateParticipants skips
  // until this is true; handleJoined calls it to catch up on current state.
  const joinedRef = useRef(false);
  // Tracks peers we've already sent our position to (via participant-joined
  // or posUpdate reply). Prevents redundant replies in the handshake protocol.
  const sentPositionToRef = useRef<Set<string>>(new Set());

  // --- Compose hooks ---

  const audio = useAudioPipeline({ callObjectRef, positionsRef });

  const spatial = useSpatialPositions({
    callObjectRef,
    positionsRef,
    onPositionChanged: audio.updateAudioRouting,
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

  // --- Participant management ---

  const updateParticipants = useCallback((co: DailyCall) => {
    if (!joinedRef.current) return;

    const pMap = co.participants();
    const list: VoiceParticipant[] = [];
    for (const p of Object.values(pMap)) {
      const pos = positionsRef.current.get(p.session_id);
      // A participant doesn't exist until we have their position.
      // The posUpdate message fills this in; updateParticipants re-runs then.
      if (!pos) continue;
      list.push(mapParticipant(p, activeSpeakerIdRef.current, pos));
    }
    setParticipants(list);

    const local = pMap.local;
    setMicOn(local.tracks.audio.state === "playable");
    setCameraOn(local.tracks.video.state === "playable");

    screenShare.detectScreenSharer(list);
    void audio.manageAudioNodes(co);
    audio.manageLocalAnalyser(co);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- individual methods are stable useCallback refs; adding the parent objects would re-create this callback on every render
  }, [screenShare.detectScreenSharer, audio.manageAudioNodes, audio.manageLocalAnalyser]);

  // --- Shared helpers ---

  /** Send our posUpdate to a specific peer and mark them in sentPositionToRef.
   *  No-op if local position isn't set yet (joined-meeting hasn't fired). */
  const sendPositionTo = useCallback((co: DailyCall, targetSid: string) => {
    const localSid = co.participants().local.session_id;
    const localPos = positionsRef.current.get(localSid);
    if (localPos) {
      sentPositionToRef.current.add(targetSid);
      const msg: AppMessage = { type: "posUpdate", sessionId: localSid, position: localPos };
      co.sendAppMessage(msg, targetSid);
    }
  }, [positionsRef]);

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

    // Spatial messages: posUpdate, moveUser
    spatial.onAppMessage(msg, fromId, co);

    // Position messages may have materialized new participants (their
    // position now exists in positionsRef, passing the gate in
    // updateParticipants). Re-derive the list synchronously so they
    // appear without a setTimeout delay.
    if (msg.type === "posUpdate" || msg.type === "moveUser") {
      updateParticipants(co);
    }

    // Handshake reply: if we haven't sent our position to this peer yet,
    // reply with our own posUpdate so they can see us. This completes the
    // per-peer handshake initiated by participant-joined. sendPositionTo
    // only marks the set when localPos exists, so if joined-meeting hasn't
    // fired yet we'll retry on the next posUpdate from this peer.
    if (msg.type === "posUpdate" && !sentPositionToRef.current.has(fromId)) {
      sendPositionTo(co, fromId);
    }

    // Moderator messages: moderatorMute, moderatorLock
    moderator.onAppMessage(msg, fromId, co);
  }, [spatial, moderator, updateParticipants, sendPositionTo]);

  // --- Shared reset ---

  const resetState = useCallback(() => {
    joinedRef.current = false;
    sentPositionToRef.current.clear();
    setJoined(false);
    setParticipants([]);
    setMicOn(true);
    setCameraOn(false);
    setCameraAllowed(false);
    setLocalRole("gamer");
    activeSpeakerIdRef.current = null;
    spatial.reset();
    moderator.reset();
    screenShare.reset();
    audio.reset();
  }, [spatial, moderator, screenShare, audio]);

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
      const co = Daily.createCallObject({
        audioSource: true,
        videoSource: true,
        startVideoOff: true,
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
        const rawName = local.user_name || "";
        setLocalRole(rawName.split("|")[1] as UserRole);

        // Set local position before updateParticipants so the local user
        // passes the position gate and appears immediately.
        spatial.onJoined(local.session_id);
        updateParticipants(co);
      };

      // Position handshake initiation + reply logic lives here in the
      // provider; position storage and movement live in use-spatial-positions.
      const handleParticipantJoined = (event: { participant: DailyParticipant }) => {
        // Guard against events on a stale call object (e.g., rapid
        // rejoin before the previous instance is fully destroyed).
        // Daily.co guarantees joined-meeting fires before any
        // participant-joined, so this isn't a race condition guard.
        if (!joinedRef.current) return;
        const newPeerSid = event.participant.session_id;
        const localSid = co.participants().local.session_id;

        // Send our own position to the new peer. participant-joined only
        // fires once the SFU route is established, so this message is
        // guaranteed to arrive. The new peer replies with their own
        // posUpdate, completing a bidirectional handshake.
        sendPositionTo(co, newPeerSid);

        // Self-report our lock state so the new peer's moderator UI is accurate.
        // Each peer only claims their own state — the real enforcement is
        // Daily.co's canSend permission at the SFU level.
        const myLocks = moderator.lockStateRef.current.get(localSid);
        if (myLocks && (myLocks.audio || myLocks.video)) {
          const lockMsg: AppMessage = { type: "lockSync", lock: myLocks };
          co.sendAppMessage(lockMsg, newPeerSid);
        }
      };

      const handleParticipantUpdate = () => updateParticipants(co);
      const handleTrackStarted = () => updateParticipants(co);

      const handleParticipantLeft = (event: { participant: DailyParticipant }) => {
        const sid = event.participant.session_id;
        sentPositionToRef.current.delete(sid);
        spatial.onParticipantLeft(sid);
        moderator.onParticipantLeft(sid);
        audio.onParticipantLeft(sid);
        updateParticipants(co);
      };

      const handleLeft = () => resetState();

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
    [updateParticipants, handleAppMessage, resetState, sendPositionTo, audio, spatial, moderator],
  );

  const leave = useCallback(async () => {
    if (callObjectRef.current) {
      await callObjectRef.current.leave();
      await callObjectRef.current.destroy();
      callObjectRef.current = null;
      setCallObject(null);
      resetState();
    }
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

  // Clean up call object on unmount.
  // Audio and spatial hooks handle their own cleanup via internal useEffects.
  useEffect(() => {
    return () => {
      if (callObjectRef.current) {
        callObjectRef.current.leave().catch(() => {});
        callObjectRef.current.destroy().catch(() => {});
      }
    };
  }, []);

  // --- Context ---

  const contextValue = useMemo<VoiceRoomContextValue>(
    () => ({
      joined,
      joining,
      participants,
      micOn,
      cameraOn,
      cameraAllowed,
      join,
      leave,
      toggleMic,
      toggleCamera,
      callObject,
      localZone: spatial.localZone,
      localRole,
      moveLocal: spatial.moveLocal,
      moveOther: spatial.moveOther,
      getAnalyser: audio.getAnalyser,
      volumeMultipliers: audio.volumeMultipliers,
      setParticipantVolume: audio.setParticipantVolume,
      screenSharerSessionId: screenShare.screenSharerSessionId,
      canScreenShare: screenShare.canScreenShare,
      isScreenSharing: screenShare.isScreenSharing,
      startScreenShare: screenShare.startScreenShare,
      stopScreenShare: screenShare.stopScreenShare,
      localLocks: moderator.localLocks,
      lockStates: moderator.lockStates,
      muteParticipant: moderator.muteParticipant,
      lockParticipant: moderator.lockParticipant,
    }),
    [joined, joining, participants, micOn, cameraOn, cameraAllowed, join, leave, toggleMic, toggleCamera, callObject, spatial.localZone, localRole, spatial.moveLocal, spatial.moveOther, audio.getAnalyser, audio.volumeMultipliers, audio.setParticipantVolume, screenShare.screenSharerSessionId, screenShare.canScreenShare, screenShare.isScreenSharing, screenShare.startScreenShare, screenShare.stopScreenShare, moderator.localLocks, moderator.lockStates, moderator.muteParticipant, moderator.lockParticipant],
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
