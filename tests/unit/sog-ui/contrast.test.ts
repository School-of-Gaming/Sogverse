import { describe, expect, it } from "vitest";

import { NEUTRALS, YTY_FAMILIES } from "../../../packages/sog-ui/src/tokens/brand";
import {
  PAIRINGS,
  contrastRatio,
  measure,
} from "../../../packages/sog-ui/src/tokens/contrast";

/**
 * Contrast, held rather than remembered.
 *
 * A consumer trusts the library to have proven every pairing it offers, and
 * this is where that proof lives: the whole shipped list is walked, and a hue
 * that stops clearing the threshold its pairing is held to fails out loud
 * instead of shipping.
 */

describe("shipped pairings", () => {
  // Vitest's `it.each([])` registers nothing and the suite passes green, so every
  // table in this file is floored: an emptied list must fail rather than vanish.
  it("has the whole shipped list to walk", () => {
    expect(PAIRINGS.length).toBeGreaterThanOrEqual(30);
  });

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
});

/**
 * The band wit-strong sits in, on every ground the library ships.
 *
 * This is not a value restating itself: it is the measurement the whole
 * strong/soft doctrine rests on, expressed as the logic it implies. Wit-strong
 * clears the glyph floor everywhere and the body floor nowhere, which is what
 * makes "strong fills and draws, soft carries text" a rule rather than a habit.
 * If a retune ever lifted it over the body floor, the rule would have lost the
 * case that forces it and would have to be re-argued rather than inherited.
 */
const GROUNDS: [string, string][] = [
  ["the page", NEUTRALS.background.hex],
  ["a card", NEUTRALS.card.hex],
  ["a row under the pointer", NEUTRALS.accent.hex],
  ["a de-emphasised block", NEUTRALS.muted.hex],
];

describe("the wit-strong band", () => {
  it("has every ground to measure against", () => {
    expect(GROUNDS).toHaveLength(4);
  });

  it.each(GROUNDS)(
    "wit-strong on %s clears the glyph floor and misses the body floor",
    (_label, ground) => {
      const ratio = contrastRatio(YTY_FAMILIES.wit.strong, ground);
      expect(ratio).toBeGreaterThanOrEqual(3);
      expect(ratio).toBeLessThan(4.5);
    },
  );
});
