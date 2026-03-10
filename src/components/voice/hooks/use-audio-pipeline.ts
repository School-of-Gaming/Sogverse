import { useCallback, useEffect, useRef, useState } from "react";
import type { DailyCall } from "@daily-co/daily-js";
import type { SpatialPosition } from "@/lib/constants/spatial";
import { canHearZone } from "@/lib/constants/spatial";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import type { AudioNodes } from "./types";

interface UseAudioPipelineParams {
  callObjectRef: React.MutableRefObject<DailyCall | null>;
  positionsRef: React.MutableRefObject<Map<string, SpatialPosition>>;
}

async function ensureAudioContextResumed(ctx: AudioContext): Promise<void> {
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

export function useAudioPipeline({ callObjectRef, positionsRef }: UseAudioPipelineParams) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<Map<string, AudioNodes>>(new Map());
  const audioTrackIdsRef = useRef<Map<string, string>>(new Map());
  const localAnalyserRef = useRef<{ source: MediaStreamAudioSourceNode; analyser: AnalyserNode } | null>(null);

  const volumeMultipliersRef = useRef<Map<string, number>>(new Map());
  const [volumeMultipliers, setVolumeMultipliers] = useState<Map<string, number>>(new Map());

  /** Update audio routing — element.volume handles both zone muting and
   *  user volume control. See docs/chrome-webrtc-volume-bug.md. */
  const updateAudioRouting = useCallback(() => {
    const co = callObjectRef.current;
    if (!co) return;

    const localSessionId = co.participants().local?.session_id;
    if (!localSessionId) return;

    const localPos = positionsRef.current.get(localSessionId);
    const lZone = localPos?.zone ?? "general";

    for (const [sessionId, nodes] of audioNodesRef.current) {
      const remotePos = positionsRef.current.get(sessionId);
      const rZone = remotePos?.zone ?? "general";
      const multiplier = volumeMultipliersRef.current.get(sessionId) ?? 1.0;
      nodes.element.volume = canHearZone(lZone, rZone) ? multiplier : 0;
    }
  }, [callObjectRef, positionsRef]);

  /** Set volume multiplier for a remote participant (0.1–1.0) */
  const setParticipantVolume = useCallback((sessionId: string, volume: number) => {
    const clamped = Math.max(VOICE_CONFIG.MIN_VOLUME, Math.min(VOICE_CONFIG.MAX_VOLUME, volume));
    volumeMultipliersRef.current.set(sessionId, clamped);
    setVolumeMultipliers(new Map(volumeMultipliersRef.current));
    updateAudioRouting();
  }, [updateAudioRouting]);

  /** Manage audio pipeline for remote participants.
   *  <audio> elements handle WebRTC playback and all audible control (volume,
   *  zone muting) via element.volume. The Web Audio graph exists solely for
   *  speaking-glow visualization — Chrome bypasses it for output on
   *  MediaStream-backed elements. See docs/chrome-webrtc-volume-bug.md. */
  const manageAudioNodes = useCallback(async (co: DailyCall) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    await ensureAudioContextResumed(ctx);

    const pMap = co.participants();
    const activeSessionIds = new Set<string>();
    let changed = false;

    for (const p of Object.values(pMap)) {
      if (p.local) continue;
      activeSessionIds.add(p.session_id);

      const audioTrack = p.tracks.audio;
      if (audioTrack?.state === "playable" && audioTrack.persistentTrack) {
        const trackId = audioTrack.persistentTrack.id;
        const prevTrackId = audioTrackIdsRef.current.get(p.session_id);

        if (prevTrackId === trackId) continue;
        audioTrackIdsRef.current.set(p.session_id, trackId);
        changed = true;

        // Clean up previous nodes + element
        const existing = audioNodesRef.current.get(p.session_id);
        if (existing) {
          existing.source.disconnect();
          existing.element.srcObject = null;
          existing.element.remove();
        }

        // Create <audio> element for reliable WebRTC track playback
        const element = new Audio();
        element.srcObject = new MediaStream([audioTrack.persistentTrack]);
        element.autoplay = true;
        element.play().catch(() => {});

        // Web Audio graph for speaking glow visualization only.
        // Must terminate at ctx.destination for AnalyserNode to process data.
        const source = ctx.createMediaElementSource(element);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;

        source.connect(analyser);
        analyser.connect(ctx.destination);

        audioNodesRef.current.set(p.session_id, { element, source, analyser });
      }
    }

    // Clean up nodes for participants who left
    for (const [sessionId] of audioNodesRef.current) {
      if (!activeSessionIds.has(sessionId)) {
        changed = true;
        audioTrackIdsRef.current.delete(sessionId);

        const nodes = audioNodesRef.current.get(sessionId);
        if (nodes) {
          nodes.source.disconnect();
          nodes.element.srcObject = null;
          nodes.element.remove();
        }
        audioNodesRef.current.delete(sessionId);
      }
    }

    if (changed) {
      updateAudioRouting();
    }
  }, [updateAudioRouting]);

  /** Manage analyser for local user's mic track (glow visualization only) */
  const manageLocalAnalyser = useCallback((co: DailyCall) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const local = co.participants().local;
    const audioTrack = local?.tracks?.audio;
    if (audioTrack?.state === "playable" && audioTrack.persistentTrack) {
      const existingTrack = localAnalyserRef.current?.source.mediaStream?.getAudioTracks()[0];
      if (existingTrack !== audioTrack.persistentTrack) {
        if (localAnalyserRef.current) {
          localAnalyserRef.current.source.disconnect();
        }
        const stream = new MediaStream([audioTrack.persistentTrack]);
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        localAnalyserRef.current = { source, analyser };
      }
    }
  }, []);

  /** Get the AnalyserNode for a participant (local or remote) */
  const getAnalyser = useCallback((sessionId: string): AnalyserNode | null => {
    const co = callObjectRef.current;
    if (co) {
      const localSid = co.participants().local?.session_id;
      if (sessionId === localSid && localAnalyserRef.current) {
        return localAnalyserRef.current.analyser;
      }
    }
    return audioNodesRef.current.get(sessionId)?.analyser ?? null;
  }, [callObjectRef]);

  /** Clean up all audio nodes and elements */
  const cleanupAudioNodes = useCallback(() => {
    for (const [, nodes] of audioNodesRef.current) {
      nodes.source.disconnect();
      nodes.element.srcObject = null;
      nodes.element.remove();
    }
    audioNodesRef.current.clear();
    audioTrackIdsRef.current.clear();

    if (localAnalyserRef.current) {
      localAnalyserRef.current.source.disconnect();
      localAnalyserRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => cleanupAudioNodes();
  }, [cleanupAudioNodes]);

  /** Create a fresh AudioContext (called at join time) */
  const createAudioContext = useCallback(() => {
    audioContextRef.current = new AudioContext();
  }, []);

  /** Clean up volume multiplier for a participant who left */
  const onParticipantLeft = useCallback((sessionId: string) => {
    volumeMultipliersRef.current.delete(sessionId);
    setVolumeMultipliers(new Map(volumeMultipliersRef.current));
  }, []);

  /** Reset all state (join/leave) */
  const reset = useCallback(() => {
    cleanupAudioNodes();
    volumeMultipliersRef.current.clear();
    setVolumeMultipliers(new Map());
  }, [cleanupAudioNodes]);

  return {
    volumeMultipliers,
    setParticipantVolume,
    getAnalyser,
    updateAudioRouting,
    manageAudioNodes,
    manageLocalAnalyser,
    cleanupAudioNodes,
    createAudioContext,
    onParticipantLeft,
    reset,
  };
}
