import { useRef } from "react";
import { computeGlowStyle } from "@/lib/voice/glow";
import { useSpeakingGlow } from "../hooks/use-speaking-glow";
import type { VoiceParticipant } from "../hooks/types";
import { useVoiceRoom } from "../VoiceRoomProvider";

/**
 * One person's speaking glow.
 *
 * **Two signals, for two elements.** A live room drives the glow frame by frame
 * from the audio analyser through `glowRef`, rewriting that element's inline style
 * every frame, so the steady glow a room without an analyser takes from
 * `isSpeaking` goes on a different element, where that loop cannot wipe it.
 *
 * `active` stops the analyser loop for a surface that is mounted but out of sight.
 */
export function useParticipantGlow(p: VoiceParticipant, active = true) {
  const { getAnalyser } = useVoiceRoom();
  const glowRef = useRef<HTMLDivElement>(null);
  useSpeakingGlow(glowRef, p.sessionId, active && p.audioOn);
  const steadyGlow =
    p.isSpeaking && p.audioOn && getAnalyser(p.sessionId) === null
      ? computeGlowStyle(1)
      : undefined;
  return { glowRef, steadyGlow };
}
