import type { CSSProperties } from "react";

/**
 * Audio-level-driven "speaking glow" applied to participant avatars. Relocated
 * out of the deleted spatial config — it's purely a visual treatment, unrelated
 * to the old canvas geometry. Color is RGB for use inside rgba().
 *
 * **This is a glow, not a colour at an alpha step.** The alpha here is the audio
 * level itself — the whole point of the construct is that it rises and falls
 * with how loudly someone is speaking — so there is no fixed value a token
 * could hold and nothing for the no-alpha rule to convert. White is the light,
 * not a brand colour spent quietly. A sweep must not take it on pattern.
 */
export const SPEAKING_GLOW = {
  color: "255, 255, 255",
  maxSpread: 14,
  threshold: 0.05,
};

/** Compute inline glow styles for a given audio level (0–1).
 *  Returns an empty object below threshold (no glow). */
export function computeGlowStyle(level: number): CSSProperties {
  if (level <= SPEAKING_GLOW.threshold) return {};
  const spread = level * SPEAKING_GLOW.maxSpread;
  const opacity = 0.3 + level * 0.5;
  return {
    boxShadow: `0 0 ${spread}px rgba(${SPEAKING_GLOW.color}, ${opacity})`,
    borderColor: `rgba(${SPEAKING_GLOW.color}, ${0.5 + level * 0.5})`,
  };
}
