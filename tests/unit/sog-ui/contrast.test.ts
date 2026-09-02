import { describe, expect, it } from "vitest";

import {
  BRAND,
  NEUTRALS,
  STATUS,
  YTY_FAMILIES,
} from "../../../packages/sog-ui/src/tokens/brand";
import {
  PAIRINGS,
  contrastRatio,
  measure,
} from "../../../packages/sog-ui/src/tokens/contrast";

/**
 * Contrast, held rather than remembered.
 *
 * Two checks, and they do different jobs. The first walks every pairing the
 * library ships and fails if one stops clearing the threshold it is held to —
 * that is the guard against a retuned hue. The second pins the individual
 * numbers the design pass recorded, so a *silent* shift is caught even where it
 * still clears: a value that moves from 6.69 to 5.20 has changed the palette,
 * and a threshold check alone would let it through.
 */

const INK = NEUTRALS.background.hex;
const TOLERANCE = 0.01;

describe("shipped pairings", () => {
  it.each(PAIRINGS.map((pairing) => [pairing.id, pairing] as const))(
    "%s clears its threshold",
    (_id, pairing) => {
      const ratio = measure(pairing);
      expect(
        ratio,
        `${pairing.foreground.token} on ${pairing.background.token}: ${ratio.toFixed(2)}:1 — ${pairing.why}`,
      ).toBeGreaterThanOrEqual(pairing.threshold);
    },
  );

  it("names each pairing exactly once", () => {
    const ids = PAIRINGS.map((pairing) => pairing.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * The numbers the design pass wrote down, recomputed.
 *
 * The four fills come from the button recipe on `ref/brand-palette-design-pass`;
 * the wit-strong trio is the measurement that made soft the text variant for
 * that family everywhere.
 */
describe("pinned measurements", () => {
  it.each([
    ["valor-strong under dark ink", YTY_FAMILIES.valor.strong, INK, 6.69],
    ["harmony-strong under dark ink", YTY_FAMILIES.harmony.strong, INK, 6.11],
    ["glow-strong under dark ink", YTY_FAMILIES.glow.strong, INK, 6.63],
    ["wit-soft under dark ink", YTY_FAMILIES.wit.soft, INK, 8.1],
    ["amber under dark ink", BRAND.primary.hex, INK, 9.58],
    ["white on violet", BRAND.secondary.foreground, BRAND.secondary.hex, 6.43],
    ["the app's ink on the page", NEUTRALS.foreground.hex, INK, 16.0],
  ])("%s holds its recorded ratio", (_label, foreground, background, expected) => {
    expect(Math.abs(contrastRatio(foreground, background) - expected)).toBeLessThanOrEqual(
      TOLERANCE,
    );
  });

  /**
   * Wit-strong across all three grounds: 3:1 everywhere, 4.5:1 nowhere. This is
   * the measurement the whole strong/soft doctrine rests on, and `--info` is
   * this exact hue, so an info-toned label spells wit-soft while an info border
   * and an info fill stand.
   */
  it.each([
    ["the page", NEUTRALS.background.hex, 4.1],
    ["a card", NEUTRALS.card.hex, 3.81],
    ["the muted ground", NEUTRALS.muted.hex, 3.31],
  ])("wit-strong on %s clears 3:1 and misses 4.5:1", (_label, ground, expected) => {
    const ratio = contrastRatio(YTY_FAMILIES.wit.strong, ground);
    expect(Math.abs(ratio - expected)).toBeLessThanOrEqual(TOLERANCE);
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(ratio).toBeLessThan(4.5);
  });

  /**
   * The two status foregrounds that are not straightforward, kept measured so
   * neither can be "tidied" back without the number changing in front of
   * somebody. White on the success green fails both floors, which is why that
   * foreground is dark ink; white on destructive clears the glyph floor only,
   * and is carried from a value the design pass ruled untouched.
   */
  it("records why success takes ink and what destructive costs", () => {
    const close = (actual: number, expected: number) =>
      expect(Math.abs(actual - expected)).toBeLessThanOrEqual(TOLERANCE);
    close(contrastRatio("#FFFFFF", STATUS.success.hex), 2.83);
    close(contrastRatio(STATUS.success.foreground, STATUS.success.hex), 6.63);
    close(
      contrastRatio(STATUS.destructive.foreground, STATUS.destructive.hex),
      3.76,
    );
  });
});
