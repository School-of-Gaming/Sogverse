"use client";

import { useEffect, useRef } from "react";
import { useVoiceRoom } from "./VoiceRoomProvider";

interface MicLevelIndicatorProps {
  /**
   * Drive the meter from this raw `getUserMedia` stream — the instant-room
   * lobby, which has a preview stream but no Daily call object yet. When
   * omitted, the meter reads the local Daily audio track from context (in-call).
   */
  stream?: MediaStream | null;
  /** Whether the mic is on. Defaults to the in-call mic state from context. */
  active?: boolean;
}

/**
 * A live mic-input level bar, shown in the mic-settings popover so the user can
 * confirm the *right* device is being captured. Works in two modes: off a raw
 * lobby stream (props) or the local Daily track (context).
 */
export function MicLevelIndicator({ stream, active }: MicLevelIndicatorProps = {}) {
  const { callObject, joined, micOn } = useVoiceRoom();
  const barRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  // `stream` passed (even as null) means "lobby mode" — drive off the prop, not
  // the Daily call object.
  const usingStream = stream !== undefined;
  const isActive = usingStream ? !!active : joined && micOn;

  const track = usingStream
    ? (stream?.getAudioTracks()[0] ?? null)
    : callObject && joined
      ? (callObject.participants().local.tracks.audio.persistentTrack ?? null)
      : null;

  // Own the AudioContext for the component's lifetime. The meter only mounts
  // when the popover opens — a user gesture — which on iOS Safari is the one
  // moment we're allowed to resume the context out of its initial `suspended`
  // state. We deliberately do NOT recreate it when the mic *device* changes:
  // that swap runs through an async getUserMedia, so a context created
  // afterward would be past the gesture's activation window and stay suspended
  // (the bug — meter frozen after a switch until the popover is reopened).
  // Reusing the already-resumed context keeps the bar live across switches.
  useEffect(() => {
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    void ctx.resume().catch(() => {
      // Resume can reject on a context closed by a fast unmount; harmless.
    });
    return () => {
      ctxRef.current = null;
      void ctx.close();
    };
  }, []);

  // (Re)attach the analyser to the current track on the persistent context.
  useEffect(() => {
    const bar = barRef.current;
    const ctx = ctxRef.current;
    if (!bar || !isActive || !track || !ctx) {
      if (bar) bar.style.width = "0%";
      return;
    }

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.fftSize);
    let rafId = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const level = Math.min(1, rms * 3);
      bar.style.width = `${level * 100}%`;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      source.disconnect();
    };
  }, [track, isActive]);

  if (!isActive) return null;

  return (
    <div className="h-1 w-20 overflow-hidden rounded-full bg-muted">
      <div
        ref={barRef}
        className="h-full rounded-full bg-success transition-[width] duration-75"
        style={{ width: "0%" }}
      />
    </div>
  );
}
