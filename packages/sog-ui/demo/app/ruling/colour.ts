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

/**
 * What Tailwind's `/n` modifier actually emits, for a colour the theme has no
 * token for.
 *
 * `bg-x/10` compiles to `color-mix(in oklab, var(--color-x) 10%, transparent)`,
 * so a demo that wants to draw the *real* rendering of an alpha step — rather
 * than its own arithmetic dressed up as one — has to spell it the same way.
 * Only the status colours need this: `destructive`, `success`, `info` and
 * `warning` are not library tokens yet, so there is no class to write and the
 * value has to be built here.
 */
export function tailwindAlpha(hex: string, percent: number): string {
  return `color-mix(in oklab, ${hex} ${percent}%, transparent)`;
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
