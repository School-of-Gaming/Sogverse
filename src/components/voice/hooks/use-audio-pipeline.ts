import { useCallback, useEffect, useRef, useState } from "react";
import type { DailyCall } from "@daily-co/daily-js";
import type { SpatialPosition } from "@/lib/constants/spatial";
import { canHearZone } from "@/lib/constants/spatial";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import type { AudioNodes } from "./types";

interface UseAudioPipelineParams {
  callObjectRef: React.MutableRefObject<DailyCall | null>;
  positionsRef: React.MutableRefObject<Map<string, { current: SpatialPosition }>>;
  analyserRefsRef: React.MutableRefObject<Map<string, { current: AnalyserNode | null }>>;
}

async function ensureAudioContextResumed(ctx: AudioContext): Promise<void> {
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

export function useAudioPipeline({ callObjectRef, positionsRef, analyserRefsRef }: UseAudioPipelineParams) {
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

    const localSessionId = co.participants().local.session_id;

    const localPos = positionsRef.current.get(localSessionId)?.current;
    const lZone = localPos?.zone ?? "general";

    for (const [sessionId, nodes] of audioNodesRef.current) {
      const remotePos = positionsRef.current.get(sessionId)?.current;
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
   *  zone muting) via element.volume. A separate MediaStreamSource feeds the
   *  AnalyserNode for speaking-glow visualization.
   *
   *  IMPORTANT: Do NOT use createMediaElementSource for the analyser.
   *  Chrome doesn't reliably route MediaStream-backed element audio through
   *  the Web Audio graph, so the AnalyserNode gets silence. Using an
   *  independent createMediaStreamSource from the same track avoids this.
   *  See docs/chrome-webrtc-volume-bug.md. */
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
      if (audioTrack.state === "playable" && audioTrack.persistentTrack) {
        const trackId = audioTrack.persistentTrack.id;
        const prevTrackId = audioTrackIdsRef.current.get(p.session_id);

        if (prevTrackId === trackId) continue;
        audioTrackIdsRef.current.set(p.session_id, trackId);
        changed = true;

        // Clean up previous nodes + element
        const existing = audioNodesRef.current.get(p.session_id);
        if (existing) {
          existing.analyserSource.disconnect();
          existing.element.srcObject = null;
          existing.element.remove();
        }

        // <audio> element for playback — element.volume controls
        // volume and zone muting. Completely independent of Web Audio.
        const element = new Audio();
        element.srcObject = new MediaStream([audioTrack.persistentTrack]);
        element.autoplay = true;
        element.play().catch(() => {});

        // Separate MediaStreamSource → AnalyserNode for speaking glow.
        // Not connected to ctx.destination — same pattern as the local
        // analyser and MicLevelIndicator.
        const analyserSource = ctx.createMediaStreamSource(
          new MediaStream([audioTrack.persistentTrack]),
        );
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyserSource.connect(analyser);

        audioNodesRef.current.set(p.session_id, { element, analyserSource, analyser });

        // Update the shared analyser ref holder
        const aRef = analyserRefsRef.current.get(p.session_id);
        if (aRef) {
          aRef.current = analyser;
        } else {
          analyserRefsRef.current.set(p.session_id, { current: analyser });
        }
      }
    }

    // Clean up nodes for participants who left
    for (const [sessionId] of audioNodesRef.current) {
      if (!activeSessionIds.has(sessionId)) {
        changed = true;
        audioTrackIdsRef.current.delete(sessionId);

        const nodes = audioNodesRef.current.get(sessionId);
        if (nodes) {
          nodes.analyserSource.disconnect();
          nodes.element.srcObject = null;
          nodes.element.remove();
        }
        audioNodesRef.current.delete(sessionId);

        const aRef = analyserRefsRef.current.get(sessionId);
        if (aRef) aRef.current = null;
        analyserRefsRef.current.delete(sessionId);
      }
    }

    if (changed) {
      updateAudioRouting();
    }
  }, [updateAudioRouting, analyserRefsRef]);

  /** Manage analyser for local user's mic track (glow visualization only) */
  const manageLocalAnalyser = useCallback((co: DailyCall) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;

    const local = co.participants().local;
    const localSid = local.session_id;
    const audioTrack = local.tracks.audio;
    if (audioTrack.state === "playable" && audioTrack.persistentTrack) {
      const existingTrack = localAnalyserRef.current?.source.mediaStream.getAudioTracks()[0];
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

        // Update the shared analyser ref holder
        const aRef = analyserRefsRef.current.get(localSid);
        if (aRef) {
          aRef.current = analyser;
        } else {
          analyserRefsRef.current.set(localSid, { current: analyser });
        }
      }
    }
  }, [analyserRefsRef]);

  /** Clean up all audio nodes and elements */
  const cleanupAudioNodes = useCallback(() => {
    for (const [, nodes] of audioNodesRef.current) {
      nodes.analyserSource.disconnect();
      nodes.element.remove();
    }
    audioNodesRef.current.clear();
    audioTrackIdsRef.current.clear();
    analyserRefsRef.current.clear();

    if (localAnalyserRef.current) {
      localAnalyserRef.current.source.disconnect();
      localAnalyserRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [analyserRefsRef]);

  // Clean up on unmount
  useEffect(() => {
    return () => cleanupAudioNodes();
  }, [cleanupAudioNodes]);

  /** Create a fresh AudioContext (called at join time) */
  const createAudioContext = useCallback(() => {
    audioContextRef.current = new AudioContext();
  }, []);

  /** Clean up volume multiplier and analyser ref for a participant who left */
  const onParticipantLeft = useCallback((sessionId: string) => {
    volumeMultipliersRef.current.delete(sessionId);
    setVolumeMultipliers(new Map(volumeMultipliersRef.current));
    const aRef = analyserRefsRef.current.get(sessionId);
    if (aRef) aRef.current = null;
    analyserRefsRef.current.delete(sessionId);
  }, [analyserRefsRef]);

  /** Reset all state (join/leave) */
  const reset = useCallback(() => {
    cleanupAudioNodes();
    volumeMultipliersRef.current.clear();
    setVolumeMultipliers(new Map());
  }, [cleanupAudioNodes]);

  return {
    volumeMultipliers,
    setParticipantVolume,
    updateAudioRouting,
    manageAudioNodes,
    manageLocalAnalyser,
    cleanupAudioNodes,
    createAudioContext,
    onParticipantLeft,
    reset,
  };
}
