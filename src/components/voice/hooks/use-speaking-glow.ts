import { useEffect, type RefObject } from "react";
import { computeGlowStyle } from "@/lib/constants/spatial.config";
import { useVoiceRoom } from "../VoiceRoomProvider";

/**
 * Animate a white speaking glow on a DOM element using the participant's
 * AnalyserNode. Drives boxShadow + borderColor via direct DOM mutation
 * (no React re-renders). Skips the rAF loop when the participant is muted.
 */
export function useSpeakingGlow(
  ref: RefObject<HTMLElement | null>,
  sessionId: string,
  audioOn: boolean,
) {
  const { getAnalyser } = useVoiceRoom();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!audioOn) {
      el.style.boxShadow = "";
      el.style.borderColor = "";
      return;
    }

    const dataArray = new Uint8Array(256);
    let rafId = 0;

    const tick = () => {
      const analyser = getAnalyser(sessionId);
      if (analyser) {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const level = Math.min(1, rms * 3);
        const glow = computeGlowStyle(level);
        el.style.boxShadow = (glow.boxShadow as string) ?? "";
        el.style.borderColor = (glow.borderColor as string) ?? "";
      } else {
        el.style.boxShadow = "";
        el.style.borderColor = "";
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [ref, getAnalyser, sessionId, audioOn]);
}
