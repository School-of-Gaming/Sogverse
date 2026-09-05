/**
 * The two pieces of colour arithmetic this page needs and the library does not
 * ship, because the library has no use for either.
 *
 * `over` exists so that an alpha step is drawn and measured from one number:
 * the whole point of the Yty and alert sections is that `bg-x/10` over a
 * near-black ground is not the authored hue any more, and a ratio quoted
 * against the authored hue would be quoting a colour nobody sees. `hueOf` is
 * used only to sort a palette strip, so that two hues a few degrees apart land
 * beside each other instead of being compared from memory.
 *
 * Every ratio on this page comes from the library's own `contrastRatio`. Nothing
 * here computes one.
 */

import { hexToRgb } from "../../../src/tokens/contrast";

/**
 * `fg` at `a` opacity composited over an opaque `bg`, as the browser composites
 * it — returned as a hex so the same value can be handed to `contrastRatio`.
 */
export function over(fg: string, a: number, bg: string): string {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  const channel = (i: 0 | 1 | 2) =>
    Math.round(f[i] * a + b[i] * (1 - a))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** The same colour as a CSS `rgb()` with an alpha, for drawing a real alpha step. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${a})`;
}

/** sRGB hue in degrees, 0–360. Sorting only — no decision keys on it. */
export function hueOf(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const raw =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return (raw * 60 + 360) % 360;
}
