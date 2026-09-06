/**
 * The colour arithmetic this page needs and the library does not ship.
 *
 * `alpha` draws a real alpha step, which is the whole subject of the Yty and
 * alert comparisons: over a near-black ground `bg-x/10` composites to a darker,
 * duller colour that is no longer the brand, and the only honest way to show
 * that is to composite it rather than to describe it.
 *
 * Nothing here renders a number, and nothing here decides anything: drawing
 * only.
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
 * so a drawing that wants the *real* rendering of an alpha step — rather than
 * its own arithmetic dressed up as one — has to spell it the same way. The
 * candidate rows need it because a candidate is a value the theme has no token
 * for: a step nobody has ruled on yet cannot be written as a class, so it is
 * built here and passed as a style.
 */
export function tailwindAlpha(hex: string, percent: number): string {
  return `color-mix(in oklab, ${hex} ${percent}%, transparent)`;
}
