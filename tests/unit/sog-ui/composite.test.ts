import { describe, expect, it } from "vitest";

import { BRAND, NEUTRALS, type Hex } from "../../../packages/sog-ui/src/tokens/brand";
import { composite } from "../../../packages/sog-ui/src/tokens/composite";

/**
 * The compositing arithmetic, pinned against the values it replaced.
 *
 * Every blend below existed as a hand-typed hex before the function did — the
 * hero gradient's two glows in an email shell, and the info callout's border and
 * wash. They are pinned here because they are the evidence that the formula is
 * the one a browser runs: an implementation that rounded the other way, or
 * blended in oklab, would still look plausible and would move four colours that
 * ship in real mail. A pin that reproduces a value nobody re-derived is worth
 * more than a pin on an invented one.
 *
 * The 0.1 blends are also where the rounding shows: two of the six channels land
 * on a half step, so half-up versus half-even is a visible one-step difference
 * rather than a theoretical one.
 */

const GROUND = NEUTRALS.background.hex;
const PANEL = NEUTRALS.card.hex;
/** The app's info accent. Sogverse still owns the status colours, so it is spelled here. */
const INFO: Hex = "#308CE8";

const BLENDS: {
  name: string;
  fg: Hex;
  alpha: number;
  ground: Hex;
  expected: Hex;
}[] = [
  { name: "the hero's amber glow on the page", fg: BRAND.primary.hex, alpha: 0.2, ground: GROUND, expected: "#40300F" },
  { name: "the hero's violet glow on the page", fg: BRAND.secondary.hex, alpha: 0.1, ground: GROUND, expected: "#1F1027" },
  { name: "the info callout's border on a panel", fg: INFO, alpha: 0.5, ground: PANEL, expected: "#255381" },
  { name: "the info callout's wash on a panel", fg: INFO, alpha: 0.1, ground: PANEL, expected: "#1C252F" },
];

describe("composite", () => {
  it.each(BLENDS)("$name", ({ fg, alpha, ground, expected }) => {
    expect(composite(fg, alpha, ground)).toBe(expected);
  });

  it("returns the foreground at full alpha", () => {
    expect(composite(BRAND.primary.hex, 1, GROUND)).toBe(BRAND.primary.hex);
  });

  it("returns the ground at zero alpha", () => {
    expect(composite(BRAND.primary.hex, 0, GROUND)).toBe(GROUND);
  });

  it("refuses an alpha outside 0 to 1", () => {
    expect(() => composite(BRAND.primary.hex, 1.5, GROUND)).toThrow(RangeError);
    expect(() => composite(BRAND.primary.hex, -0.1, GROUND)).toThrow(RangeError);
  });
});
