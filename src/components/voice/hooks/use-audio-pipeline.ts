import { useCallback, useEffect, useRef } from "react";
import type { DailyCall } from "@daily-co/daily-js";
import { computeZoneVolumes, type RemoteAudioState } from "@/lib/voice/audio-routing";
import { DEFAULT_ZONE_ID } from "@/lib/constants/voice-zones";
import type { AudioNodes, ZoneUserData } from "./types";

interface UseAudioPipelineParams {
  callObjectRef: React.MutableRefObject<DailyCall | null>;
  /** Per-remote zone state, mirrored from Daily `userData` by the provider. */
  zoneInfoRef: React.MutableRefObject<Map<string, ZoneUserData>>;
  /** The local listener's current zone — the single source of truth, written
   *  synchronously by `useZoneMembership` on a move. Deliberately NOT read back
   *  from our own Daily `userData`: our own zone is something we know locally the
   *  instant we move, not something we wait for the SFU to echo to us (that echo
   *  lags on mobile Safari, and routing against the stale value made us hear the
   *  zone we just left / go silent on the one we joined). `setUserData` still
   *  fires on a move — but only so *other* clients learn where we are. */
  localZoneIdRef: React.MutableRefObject<string>;
  /** Whether the local listener is deafened (moderator-only). */
  deafenedRef: React.MutableRefObject<boolean>;
}

async function ensureAudioContextResumed(ctx: AudioContext): Promise<void> {
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
}

export function useAudioPipeline({
  callObjectRef,
  zoneInfoRef,
  localZoneIdRef,
  deafenedRef,
}: UseAudioPipelineParams) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioNodesRef = useRef<Map<string, AudioNodes>>(new Map());
  const audioTrackIdsRef = useRef<Map<string, string>>(new Map());
  const localAnalyserRef = useRef<{ source: MediaStreamAudioSourceNode; analyser: AnalyserNode } | null>(null);

  // The per-participant volume multiplier ("base" in the routing model). The
  // slider UI was dropped (the discrete-zone redesign reclaimed the space), but
  // the plumbing stays so it can be re-enabled cheaply — see TODO.md. With no
  // setter wired up it stays 1.0 for everyone.
  const volumeMultipliersRef = useRef<Map<string, number>>(new Map());

  /** Update audio routing — `element.volume` is the only audible control (zone
   *  muting + broadcast + deafen, via the pure zoneVolume decision). The
   *  separate analyser pipeline (speaking glow) and video are untouched, so
   *  cross-zone peers stay visible. See docs/chrome-webrtc-volume-bug.md. */
  const updateAudioRouting = useCallback(() => {
    const co = callObjectRef.current;
    if (!co) return;

    const localZoneId = localZoneIdRef.current;
    const deafened = deafenedRef.current;

    const remotes: RemoteAudioState[] = [];
    for (const [sessionId] of audioNodesRef.current) {
      const info = zoneInfoRef.current.get(sessionId);
      remotes.push({
        sessionId,
        zoneId: info?.zoneId ?? DEFAULT_ZONE_ID,
        broadcasting: info?.broadcasting ?? false,
        base: volumeMultipliersRef.current.get(sessionId) ?? 1.0,
      });
    }

    const volumes = computeZoneVolumes(remotes, localZoneId, deafened);
    for (const [sessionId, nodes] of audioNodesRef.current) {
      const volume = volumes.get(sessionId);
      if (volume !== undefined) nodes.element.volume = volume;
    }
  }, [callObjectRef, zoneInfoRef, localZoneIdRef, deafenedRef]);

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
      }
    }
  }, []);

  /** Get the AnalyserNode for a participant (local or remote) */
  const getAnalyser = useCallback((sessionId: string): AnalyserNode | null => {
    const co = callObjectRef.current;
    if (co) {
      const localSid = co.participants().local.session_id;
      if (sessionId === localSid && localAnalyserRef.current) {
        return localAnalyserRef.current.analyser;
      }
    }
    return audioNodesRef.current.get(sessionId)?.analyser ?? null;
  }, [callObjectRef]);

  /** Clean up all audio nodes and elements */
  const cleanupAudioNodes = useCallback(() => {
    for (const [, nodes] of audioNodesRef.current) {
      nodes.analyserSource.disconnect();
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
  }, []);

  /** Reset all state (join/leave) */
  const reset = useCallback(() => {
    cleanupAudioNodes();
    volumeMultipliersRef.current.clear();
  }, [cleanupAudioNodes]);

  return {
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
