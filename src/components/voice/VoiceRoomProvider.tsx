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

export interface VoiceParticipant {
  sessionId: string;
  userName: string;
  audioOn: boolean;
  videoOn: boolean;
  isLocal: boolean;
  isOwner: boolean;
}

interface VoiceRoomContextValue {
  /** Whether we're connected to a call */
  joined: boolean;
  /** Whether we're currently connecting */
  joining: boolean;
  /** Current participants */
  participants: VoiceParticipant[];
  /** Local user's mic state */
  micOn: boolean;
  /** Local user's camera state */
  cameraOn: boolean;
  /** Whether local user has camera permission (gedu/admin) */
  cameraAllowed: boolean;
  /** Join a room with token */
  join: (roomUrl: string, token: string) => Promise<void>;
  /** Leave the current call */
  leave: () => Promise<void>;
  /** Toggle microphone */
  toggleMic: () => void;
  /** Toggle camera */
  toggleCamera: () => void;
  /** Get the Daily call object (for video track access) */
  callObject: DailyCall | null;
}

const VoiceRoomContext = createContext<VoiceRoomContextValue | null>(null);

function mapParticipant(p: DailyParticipant): VoiceParticipant {
  return {
    sessionId: p.session_id,
    userName: p.user_name || "Unknown",
    audioOn: !p.audio ? false : p.tracks.audio?.state === "playable",
    videoOn: !p.video ? false : p.tracks.video?.state === "playable",
    isLocal: p.local,
    isOwner: p.owner ?? false,
  };
}

export function VoiceRoomProvider({ children }: { children: React.ReactNode }) {
  const [callObject, setCallObject] = useState<DailyCall | null>(null);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraAllowed, setCameraAllowed] = useState(false);
  const callObjectRef = useRef<DailyCall | null>(null);
  // Track <audio> elements for remote participants
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  /** Attach or update an <audio> element for a remote participant's audio track */
  const manageAudioTrack = useCallback((co: DailyCall) => {
    const pMap = co.participants();
    const activeSessionIds = new Set<string>();

    Object.values(pMap).forEach((p) => {
      if (p.local) return; // Don't play our own audio back

      activeSessionIds.add(p.session_id);
      const audioTrack = p.tracks.audio;

      if (audioTrack?.state === "playable" && audioTrack.persistentTrack) {
        let audioEl = audioElementsRef.current.get(p.session_id);
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.autoplay = true;
          audioElementsRef.current.set(p.session_id, audioEl);
        }

        // Only update srcObject if the track changed
        const existingTrack = audioEl.srcObject instanceof MediaStream
          ? audioEl.srcObject.getAudioTracks()[0]
          : null;
        if (existingTrack !== audioTrack.persistentTrack) {
          audioEl.srcObject = new MediaStream([audioTrack.persistentTrack]);
        }
      }
    });

    // Clean up audio elements for participants who left
    for (const [sessionId, audioEl] of audioElementsRef.current) {
      if (!activeSessionIds.has(sessionId)) {
        audioEl.srcObject = null;
        audioElementsRef.current.delete(sessionId);
      }
    }
  }, []);

  /** Clean up all audio elements */
  const cleanupAudioElements = useCallback(() => {
    for (const [, audioEl] of audioElementsRef.current) {
      audioEl.srcObject = null;
    }
    audioElementsRef.current.clear();
  }, []);

  const updateParticipants = useCallback((co: DailyCall) => {
    const pMap = co.participants();
    const list = Object.values(pMap).map(mapParticipant);
    setParticipants(list);

    // Update local audio/video state
    const local = pMap.local;
    if (local) {
      setMicOn(local.tracks.audio?.state === "playable");
      setCameraOn(local.tracks.video?.state === "playable");
    }

    // Manage audio playback for remote participants
    manageAudioTrack(co);
  }, [manageAudioTrack]);

  const join = useCallback(
    async (roomUrl: string, token: string) => {
      if (callObjectRef.current) {
        await callObjectRef.current.destroy();
      }
      cleanupAudioElements();

      setJoining(true);

      // Dynamic import to avoid SSR issues
      const Daily = (await import("@daily-co/daily-js")).default as typeof DailyIframe;
      const co = Daily.createCallObject({
        audioSource: true,
        videoSource: false, // Start with video off; gedu can toggle on
      });

      callObjectRef.current = co;
      setCallObject(co);

      const handleJoined = () => {
        setJoined(true);
        setJoining(false);
        updateParticipants(co);

        // Check if camera is allowed by token
        const local = co.participants().local;
        const canSend = local?.permissions?.canSend;
        const canUseCam = canSend === true ||
          (canSend instanceof Set && canSend.has("video"));
        setCameraAllowed(canUseCam);
      };

      const handleParticipantUpdate = () => updateParticipants(co);
      const handleParticipantJoined = () => updateParticipants(co);
      const handleParticipantLeft = () => updateParticipants(co);

      const handleLeft = () => {
        setJoined(false);
        setParticipants([]);
        setMicOn(true);
        setCameraOn(false);
        setCameraAllowed(false);
        cleanupAudioElements();
      };

      co.on("joined-meeting", handleJoined);
      co.on("participant-joined", handleParticipantJoined);
      co.on("participant-left", handleParticipantLeft);
      co.on("participant-updated", handleParticipantUpdate);
      co.on("left-meeting", handleLeft);

      await co.join({ url: roomUrl, token });
    },
    [updateParticipants, cleanupAudioElements]
  );

  const leave = useCallback(async () => {
    if (callObjectRef.current) {
      await callObjectRef.current.leave();
      await callObjectRef.current.destroy();
      callObjectRef.current = null;
      setCallObject(null);
      setJoined(false);
      setParticipants([]);
      cleanupAudioElements();
    }
  }, [cleanupAudioElements]);

  const toggleMic = useCallback(() => {
    if (!callObjectRef.current) return;
    const newState = !micOn;
    callObjectRef.current.setLocalAudio(newState);
    setMicOn(newState);
  }, [micOn]);

  const toggleCamera = useCallback(() => {
    if (!callObjectRef.current || !cameraAllowed) return;
    const newState = !cameraOn;
    callObjectRef.current.setLocalVideo(newState);
    setCameraOn(newState);
  }, [cameraOn, cameraAllowed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudioElements();
      if (callObjectRef.current) {
        callObjectRef.current.leave().catch(() => {});
        callObjectRef.current.destroy().catch(() => {});
      }
    };
  }, [cleanupAudioElements]);

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
