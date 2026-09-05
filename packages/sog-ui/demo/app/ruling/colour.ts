/**
 * The colour arithmetic this page needs and the library does not ship.
 *
 * `alpha` draws a real alpha step, which is the whole subject of the Yty and
 * alert comparisons: over a near-black ground `bg-x/10` composites to a darker,
 * duller colour that is no longer the brand, and the only honest way to show
 * that is to composite it rather than to describe it. `hueOf` is used only to
 * sort a palette strip, so that two hues a few degrees apart land beside each
 * other instead of being compared from memory.
 *
 * Nothing here renders a number, and nothing here decides anything: sorting and
 * drawing only.
 */

import { hexToRgb } from "../../../src/tokens/contrast";

/** A colour as a CSS `rgb()` with an alpha, so the browser does the compositing. */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${a})`;
}

/** sRGB hue in degrees, 0–360. Sorting only — nothing keys a decision on it. */
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
