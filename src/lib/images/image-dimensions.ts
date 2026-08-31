// The arithmetic half of client-side image normalization: given a decoded
// image's pixel dimensions and a cap on its longest edge, what size does the
// canvas get?
//
// Kept apart from `normalize-image.ts` on purpose — this file touches no DOM,
// so it is unit-testable in plain Node and the browser module above it stays
// thin enough to read in one sitting.

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Scale `source` down so neither edge exceeds `maxEdge`, preserving the aspect
 * ratio. An image already inside the cap is returned unchanged — **this is not
 * a decision about whether to re-encode it.** Every input is re-encoded
 * regardless (that uniformity is what guarantees the EXIF/GPS strip); this
 * function only answers "how many pixels", and for a small image the answer is
 * "the ones it already has".
 *
 * The long edge lands on `maxEdge` exactly, because the scale factor is
 * `maxEdge / longest`. The short edge is rounded, and clamped to at least 1: an
 * absurd ratio (a 4000 × 1 strip) would otherwise round to a zero-height
 * canvas, which throws at draw time rather than producing a thin image.
 *
 * Non-integer or out-of-range inputs are clamped rather than rejected. A
 * decoded `ImageBitmap` always reports positive integers, so a caller landing
 * here with anything else has a bug upstream — and answering with a drawable
 * size keeps that bug from turning into an exception three frames later.
 */
export function fitWithinMaxEdge(
  source: ImageDimensions,
  maxEdge: number,
): ImageDimensions {
  const cap = sanitize(maxEdge, 1);
  const width = sanitize(source.width, cap);
  const height = sanitize(source.height, cap);

  const longest = Math.max(width, height);
  if (longest <= cap) {
    return { width, height };
  }

  const scale = cap / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** A positive integer, or `fallback` for anything that is not one. */
function sanitize(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.round(value);
}
