/**
 * Alpha compositing, computed rather than typed.
 *
 * Some renderers cannot be trusted with transparency — an email client above
 * all, where a translucent fill is as likely to come out opaque, black, or not
 * at all — so a tint that the app draws as `bg-info/10` has to reach the inbox
 * as one flat opaque colour. Flattening it is arithmetic, and arithmetic is
 * exactly what the foundations tier does not let anyone do by hand: a tint
 * eyeballed once is a colour nobody can re-derive, and it drifts silently the
 * next time the hue underneath it moves.
 *
 * So this is the function that produces every composited value the library and
 * its consumers spend. Give it the colour, the alpha it would have been drawn
 * at, and the **opaque ground it actually sits on** — which is the part that is
 * easy to get wrong: a panel's tint composites against the panel, not against
 * the darker page behind it, and against the wrong ground the wash renders as a
 * visible rectangle.
 *
 * The blend is plain sRGB per channel, which is what a browser does for `rgba`
 * over an opaque backdrop: `result = foreground × alpha + ground × (1 − alpha)`,
 * rounded to the nearest 8-bit step. Deliberately not oklab — `color-mix(in
 * oklab, … transparent)`, which is what Tailwind's `/10` modifier compiles to,
 * is a different blend and would put the emailed tint a shade off the app's.
 *
 * A composited value is not a new brand colour and does not become one: it is a
 * derivation of a colour that already exists, spent where alpha is unavailable.
 * The rule that a brand colour exists only at its authored values is unaffected.
 */

import type { Hex } from "./brand";
import { hexToRgb } from "./contrast";

/**
 * `foreground` at `alpha` over the opaque `ground`, as an opaque hex.
 *
 * `alpha` is 0 to 1: 1 returns the foreground and 0 returns the ground, so the
 * two ends are the identities they look like.
 */
export function composite(foreground: Hex, alpha: number, ground: Hex): Hex {
  if (!(alpha >= 0 && alpha <= 1)) {
    throw new RangeError(`alpha must be between 0 and 1: ${alpha}`);
  }
  const front = hexToRgb(foreground);
  const back = hexToRgb(ground);
  const channels = front.map((value, i) =>
    // Math.round is half-up, which is what a browser's 8-bit quantisation does
    // and what the hand-composited values this replaced were computed with.
    Math.round(value * alpha + back[i] * (1 - alpha))
      .toString(16)
      .toUpperCase()
      .padStart(2, "0"),
  );
  return `#${channels.join("")}`;
}
