"use client";

import { useEffect, useRef } from "react";
import { useVoiceRoom } from "./VoiceRoomProvider";

export function MicLevelIndicator() {
  const { callObject, joined, micOn } = useVoiceRoom();
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!callObject || !joined || !micOn || !bar) {
      if (bar) bar.style.width = "0%";
      return;
    }

    const localTrack = callObject.participants().local.tracks.audio.persistentTrack;
    if (!localTrack) return;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = audioContext.createMediaStreamSource(
      new MediaStream([localTrack])
    );
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.fftSize);
    let rafId = 0;

    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);

      // Compute RMS level (0–1)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      // Clamp to 0–1 and apply slight boost for visibility
      const level = Math.min(1, rms * 3);
      bar.style.width = `${level * 100}%`;

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      source.disconnect();
      audioContext.close();
    };
  }, [callObject, joined, micOn]);

  if (!micOn) return null;

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
