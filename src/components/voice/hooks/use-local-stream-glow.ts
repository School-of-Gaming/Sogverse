import { useEffect, type RefObject } from "react";
import { computeGlowStyle } from "@/lib/constants/spatial.config";

/**
 * Apply a speaking glow to a DOM element from a local `MediaStream`.
 *
 * Sibling of `useSpeakingGlow` for the lobby case, where there is no
 * Daily call object yet — we have a `getUserMedia` stream directly.
 * Visually identical to the in-call glow so the lobby previews exactly
 * what the user will look like once they join.
 *
 * Drives `boxShadow` + `borderColor` via direct DOM mutation (no React
 * re-renders). Skips the rAF loop when the participant is muted, when
 * the stream is null, or when the stream has no audio tracks.
 */
export function useLocalStreamGlow(
  ref: RefObject<HTMLElement | null>,
  stream: MediaStream | null,
  audioOn: boolean,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!audioOn || !stream) {
      el.style.boxShadow = "";
      el.style.borderColor = "";
      return;
    }

    const tracks = stream.getAudioTracks();
    if (tracks.length === 0) {
      el.style.boxShadow = "";
      el.style.borderColor = "";
      return;
    }

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    // Wrap the audio track in a fresh stream — passing the original
    // `stream` directly works too, but isolating one track keeps the
    // analyser focused on the mic and avoids re-attaching when video
    // tracks toggle.
    const source = ctx.createMediaStreamSource(new MediaStream([tracks[0]]));
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    let rafId = 0;

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const norm = (data[i] - 128) / 128;
        sum += norm * norm;
      }
      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(1, rms * 3);
      const glow = computeGlowStyle(level);
      el.style.boxShadow = glow.boxShadow ?? "";
      el.style.borderColor = glow.borderColor ?? "";
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      source.disconnect();
      void ctx.close();
    };
  }, [ref, stream, audioOn]);
}
