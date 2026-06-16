import type { CSSProperties } from "react";

/**
 * Audio-level-driven "speaking glow" applied to participant avatars. Relocated
 * out of the deleted spatial config — it's purely a visual treatment, unrelated
 * to the old canvas geometry. Color is RGB for use inside rgba().
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
