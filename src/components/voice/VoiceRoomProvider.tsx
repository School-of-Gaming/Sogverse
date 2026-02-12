"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type DailyIframe from "@daily-co/daily-js";
import type {
  DailyCall,
  DailyParticipant,
} from "@daily-co/daily-js";
import type { UserRole } from "@/types";
import {
  type ZoneId,
  type SpatialPosition,
  calculateGain,
  getZoneAtPosition,
  getRandomPositionInZone,
} from "@/lib/constants/spatial";

// ---------- Types ----------

export interface VoiceParticipant {
  sessionId: string;
  userId: string;
  role: UserRole;
  userName: string;
  audioOn: boolean;
  videoOn: boolean;
  isLocal: boolean;
  isOwner: boolean;
  isSpeaking: boolean;
}

/** App message types sent via Daily.co sendAppMessage */
type AppMessage =
  | { type: "requestPositions" }
  | { type: "positionSync"; positions: Record<string, SpatialPosition> }
  | { type: "posUpdate"; sessionId: string; position: SpatialPosition }
  | { type: "moveUser"; targetSessionId: string; position: SpatialPosition };

interface VoiceRoomContextValue {
  joined: boolean;
  joining: boolean;
  participants: VoiceParticipant[];
  micOn: boolean;
  cameraOn: boolean;
  cameraAllowed: boolean;
  join: (roomUrl: string, token: string) => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => void;
  toggleCamera: () => Promise<void> | void;
  callObject: DailyCall | null;
  // Spatial extensions
  positions: Map<string, SpatialPosition>;
  localZone: ZoneId;
  localRole: UserRole;
  moveLocal: (x: number, y: number) => void;
  moveOther: (targetSessionId: string, x: number, y: number) => void;
}

const VoiceRoomContext = createContext<VoiceRoomContextValue | null>(null);

// ---------- Helpers ----------

function mapParticipant(p: DailyParticipant, activeSpeakerId: string | null): VoiceParticipant {
  // user_name is encoded as "userId|role|displayName" by the token endpoint
  const raw = p.user_name || "";
  const parts = raw.split("|");
  const userId = parts[0] || p.session_id;
  const role = (parts[1] as UserRole) || "gamer";
  const userName = parts.slice(2).join("|") || "Unknown";

  return {
    sessionId: p.session_id,
    userId,
    role,
    userName,
    audioOn: !p.audio ? false : p.tracks.audio?.state === "playable",
    videoOn: !p.video ? false : p.tracks.video?.state === "playable",
    isLocal: p.local,
    isOwner: p.owner ?? false,
    isSpeaking: p.session_id === activeSpeakerId,
  };
}

// ---------- Provider ----------

export function VoiceRoomProvider({ children }: { children: React.ReactNode }) {
  const [callObject, setCallObject] = useState<DailyCall | null>(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraAllowed, setCameraAllowed] = useState(false);
  const [localRole, setLocalRole] = useState<UserRole>("gamer");
  const callObjectRef = useRef<DailyCall | null>(null);
  const activeSpeakerIdRef = useRef<string | null>(null);

  // Spatial position state
  const positionsRef = useRef<Map<string, SpatialPosition>>(new Map());
  const [positions, setPositions] = useState<Map<string, SpatialPosition>>(new Map());
  const [localZone, setLocalZone] = useState<ZoneId>("general");
  const posUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Web Audio API refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<Map<string, { source: MediaStreamAudioSourceNode; gain: GainNode }>>(new Map());

  /** Flush positionsRef to state (throttled) */
  const flushPositions = useCallback(() => {
    setPositions(new Map(positionsRef.current));
  }, []);

  /** Schedule a throttled position flush */
  const scheduleFlush = useCallback(() => {
    if (posUpdateTimerRef.current) return;
    posUpdateTimerRef.current = setTimeout(() => {
      posUpdateTimerRef.current = null;
      flushPositions();
    }, 50);
  }, [flushPositions]);

  /** Update audio routing based on current positions */
  const updateAudioRouting = useCallback(() => {
    const co = callObjectRef.current;
    if (!co || !audioContextRef.current) return;

    const localSessionId = co.participants().local?.session_id;
    if (!localSessionId) return;

    const localPos = positionsRef.current.get(localSessionId);
    const lZone = localPos?.zone ?? "general";

    for (const [sessionId, nodes] of audioNodesRef.current) {
      const remotePos = positionsRef.current.get(sessionId);
      const rZone = remotePos?.zone ?? "general";
      const gain = calculateGain(lZone, rZone);
      nodes.gain.gain.value = gain;
    }
  }, []);

  /** Manage Web Audio nodes for remote participants */
  const manageAudioNodes = useCallback((co: DailyCall) => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;

    const pMap = co.participants();
    const activeSessionIds = new Set<string>();

    Object.values(pMap).forEach((p) => {
      if (p.local) return;
      activeSessionIds.add(p.session_id);

      const audioTrack = p.tracks.audio;
      if (audioTrack?.state === "playable" && audioTrack.persistentTrack) {
        const existing = audioNodesRef.current.get(p.session_id);
        const existingTrack = existing?.source.mediaStream?.getAudioTracks()[0];

        if (existingTrack !== audioTrack.persistentTrack) {
          // Disconnect old nodes if they exist
          if (existing) {
            existing.source.disconnect();
            existing.gain.disconnect();
          }

          const stream = new MediaStream([audioTrack.persistentTrack]);
          const source = ctx.createMediaStreamSource(stream);
          const gain = ctx.createGain();
          gain.gain.value = 1;
          source.connect(gain);
          gain.connect(ctx.destination);

          audioNodesRef.current.set(p.session_id, { source, gain });
        }
      }
    });

    // Clean up nodes for participants who left
    for (const [sessionId] of audioNodesRef.current) {
      if (!activeSessionIds.has(sessionId)) {
        const nodes = audioNodesRef.current.get(sessionId);
        if (nodes) {
          nodes.source.disconnect();
          nodes.gain.disconnect();
        }
        audioNodesRef.current.delete(sessionId);
      }
    }

    updateAudioRouting();
  }, [updateAudioRouting]);

  /** Clean up all audio nodes */
  const cleanupAudioNodes = useCallback(() => {
    for (const [, nodes] of audioNodesRef.current) {
      nodes.source.disconnect();
      nodes.gain.disconnect();
    }
    audioNodesRef.current.clear();

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const updateParticipants = useCallback((co: DailyCall) => {
    const pMap = co.participants();
    const list = Object.values(pMap).map((p) => mapParticipant(p, activeSpeakerIdRef.current));
    setParticipants(list);

    const local = pMap.local;
    if (local) {
      setMicOn(local.tracks.audio?.state === "playable");
      setCameraOn(local.tracks.video?.state === "playable");
    }

    manageAudioNodes(co);
  }, [manageAudioNodes]);

  /** Broadcast local position via app message */
  const broadcastPosition = useCallback((sessionId: string, position: SpatialPosition) => {
    const co = callObjectRef.current;
    if (!co) return;
    const msg: AppMessage = { type: "posUpdate", sessionId, position };
    co.sendAppMessage(msg, "*");
  }, []);

  /** Move local participant */
  const moveLocal = useCallback((x: number, y: number) => {
    const co = callObjectRef.current;
    if (!co) return;

    const sessionId = co.participants().local?.session_id;
    if (!sessionId) return;

    const zone = getZoneAtPosition(x, y);
    const position: SpatialPosition = { x, y, zone };

    positionsRef.current.set(sessionId, position);
    setLocalZone(zone);
    scheduleFlush();
    broadcastPosition(sessionId, position);
    updateAudioRouting();
  }, [scheduleFlush, broadcastPosition, updateAudioRouting]);

  /** Move another participant (admin/gedu only) */
  const moveOther = useCallback((targetSessionId: string, x: number, y: number) => {
    const co = callObjectRef.current;
    if (!co) return;

    const zone = getZoneAtPosition(x, y);
    const position: SpatialPosition = { x, y, zone };

    // Update our local view immediately
    positionsRef.current.set(targetSessionId, position);
    scheduleFlush();
    updateAudioRouting();

    // Tell the target to update their position
    const msg: AppMessage = { type: "moveUser", targetSessionId, position };
    co.sendAppMessage(msg, "*");
  }, [scheduleFlush, updateAudioRouting]);

  const join = useCallback(
    async (roomUrl: string, token: string) => {
      if (callObjectRef.current) {
        await callObjectRef.current.destroy();
      }
      cleanupAudioNodes();
      positionsRef.current.clear();
      setPositions(new Map());

      setJoining(true);

      // Create AudioContext
      audioContextRef.current = new AudioContext();

      const Daily = (await import("@daily-co/daily-js")).default as typeof DailyIframe;
      const co = Daily.createCallObject({
        audioSource: true,
        videoSource: true,
        startVideoOff: true,
      });

      callObjectRef.current = co;
      setCallObject(co);

      const handleJoined = () => {
        setJoined(true);
        setJoining(false);
        updateParticipants(co);

        // All participants can use camera now
        setCameraAllowed(true);

        // Determine local role from parsed participant
        const local = co.participants().local;
        if (local) {
          const mapped = mapParticipant(local, null);
          setLocalRole(mapped.role);

          // Place ourselves in general zone
          const pos = getRandomPositionInZone("general");
          const zone = getZoneAtPosition(pos.x, pos.y);
          const spatialPos: SpatialPosition = { ...pos, zone };
          positionsRef.current.set(local.session_id, spatialPos);
          setLocalZone(zone);
          flushPositions();
          broadcastPosition(local.session_id, spatialPos);

          // Request positions from existing participants
          const msg: AppMessage = { type: "requestPositions" };
          co.sendAppMessage(msg, "*");
        }
      };

      const handleParticipantUpdate = () => updateParticipants(co);

      const handleParticipantJoined = () => {
        updateParticipants(co);
      };

      const handleParticipantLeft = (event: { participant: DailyParticipant }) => {
        // Clean up position for participant who left
        positionsRef.current.delete(event.participant.session_id);
        scheduleFlush();
        updateParticipants(co);
      };

      const handleLeft = () => {
        setJoined(false);
        setParticipants([]);
        setMicOn(true);
        setCameraOn(false);
        setCameraAllowed(false);
        setLocalRole("gamer");
        setLocalZone("general");
        activeSpeakerIdRef.current = null;
        positionsRef.current.clear();
        setPositions(new Map());
        cleanupAudioNodes();
      };

      const handleActiveSpeakerChange = (event: { activeSpeaker: { peerId: string } }) => {
        activeSpeakerIdRef.current = event.activeSpeaker.peerId;
        updateParticipants(co);
      };

      // Handle app messages for spatial position sync
      const handleAppMessage = (event: { data: AppMessage; fromId: string }) => {
        const { data: msg, fromId } = event;

        switch (msg.type) {
          case "requestPositions": {
            // Send our current positions to the requester
            const posObj: Record<string, SpatialPosition> = {};
            for (const [sid, pos] of positionsRef.current) {
              posObj[sid] = pos;
            }
            const reply: AppMessage = { type: "positionSync", positions: posObj };
            co.sendAppMessage(reply, "*");
            break;
          }
          case "positionSync": {
            // Merge received positions (don't overwrite our own)
            const localSid = co.participants().local?.session_id;
            for (const [sid, pos] of Object.entries(msg.positions)) {
              if (sid !== localSid) {
                positionsRef.current.set(sid, pos);
              }
            }
            scheduleFlush();
            updateAudioRouting();
            break;
          }
          case "posUpdate": {
            const localSid = co.participants().local?.session_id;
            if (msg.sessionId !== localSid) {
              positionsRef.current.set(msg.sessionId, msg.position);
              scheduleFlush();
              updateAudioRouting();
            }
            break;
          }
          case "moveUser": {
            const localSid = co.participants().local?.session_id;
            if (msg.targetSessionId === localSid) {
              // We are being moved by an admin/gedu
              const local = co.participants().local;
              const mapped = local ? mapParticipant(local, null) : null;

              // Gamers cannot be placed in broadcast zone — reject
              if (mapped?.role === "gamer" && msg.position.zone === "broadcast") {
                break;
              }

              positionsRef.current.set(localSid, msg.position);
              setLocalZone(msg.position.zone);
              scheduleFlush();
              updateAudioRouting();
              // Re-broadcast our new position so others see the update
              broadcastPosition(localSid, msg.position);
            } else {
              // Someone else is being moved — update our view
              positionsRef.current.set(msg.targetSessionId, msg.position);
              scheduleFlush();
              updateAudioRouting();
            }
            break;
          }
        }
        // Suppress unused variable lint for fromId
        void fromId;
      };

      co.on("joined-meeting", handleJoined);
      co.on("participant-joined", handleParticipantJoined);
      co.on("participant-left", handleParticipantLeft);
      co.on("participant-updated", handleParticipantUpdate);
      co.on("active-speaker-change", handleActiveSpeakerChange);
      co.on("left-meeting", handleLeft);
      co.on("app-message", handleAppMessage);

      await co.join({ url: roomUrl, token });
    },
    [updateParticipants, cleanupAudioNodes, flushPositions, scheduleFlush, broadcastPosition, updateAudioRouting]
  );

  const leave = useCallback(async () => {
    if (callObjectRef.current) {
      await callObjectRef.current.leave();
      await callObjectRef.current.destroy();
      callObjectRef.current = null;
      setCallObject(null);
      setJoined(false);
      setParticipants([]);
      positionsRef.current.clear();
      setPositions(new Map());
      cleanupAudioNodes();
    }
  }, [cleanupAudioNodes]);

  const toggleMic = useCallback(() => {
    if (!callObjectRef.current) return;
    const newState = !micOn;
    callObjectRef.current.setLocalAudio(newState);
    setMicOn(newState);
  }, [micOn]);

  const toggleCamera = useCallback(async () => {
    if (!callObjectRef.current || !cameraAllowed) return;
    const newState = !cameraOn;
    try {
      await callObjectRef.current.setLocalVideo(newState);
      setCameraOn(newState);
    } catch {
      // Camera permission denied or device unavailable
    }
  }, [cameraOn, cameraAllowed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudioNodes();
      if (posUpdateTimerRef.current) {
        clearTimeout(posUpdateTimerRef.current);
      }
      if (callObjectRef.current) {
        callObjectRef.current.leave().catch(() => {});
        callObjectRef.current.destroy().catch(() => {});
      }
    };
  }, [cleanupAudioNodes]);

  return (
    <VoiceRoomContext.Provider
      value={{
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
        positions,
        localZone,
        localRole,
        moveLocal,
        moveOther,
      }}
    >
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
