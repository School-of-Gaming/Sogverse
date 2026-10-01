/**
 * The z-score of a two-sided 95% interval. Every confidence judgement on the
 * feedback page is made at this one level.
 */
export const Z_95 = 1.959963984540054;

/** A share's plausible range, both ends between 0 and 1. */
export interface ShareInterval {
  lower: number;
  upper: number;
}

/**
 * The Wilson score interval around an observed share `p` from a sample of `n`.
 *
 * Wilson rather than the textbook `p ± z·√(p(1−p)/n)` because the feedback
 * page lives on small samples and on shares near 100%, exactly where the
 * textbook interval collapses to zero width or runs past 1; Wilson stays
 * inside [0, 1] and stays honest about how little ten answers say. `null`
 * when there is no sample.
 */
export function wilsonInterval(p: number, n: number, z: number = Z_95): ShareInterval | null {
  if (n <= 0) return null;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const spread = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return {
    lower: Math.max(0, centre - spread),
    upper: Math.min(1, centre + spread),
  };
}
