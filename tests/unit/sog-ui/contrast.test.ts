import { describe, expect, it } from "vitest";

import {
  BRAND,
  NEUTRALS,
  STATUS,
  YTY_FAMILIES,
} from "../../../packages/sog-ui/src/tokens/brand";
import {
  KNOWN_SHORTFALLS,
  PAIRINGS,
  contrastRatio,
  measure,
} from "../../../packages/sog-ui/src/tokens/contrast";

/**
 * Contrast, held rather than remembered.
 *
 * Three checks, and they do different jobs. The first walks every pairing the
 * library ships and fails if one stops clearing the threshold it is held to —
 * that is the guard against a retuned hue. The second walks the shortfalls and
 * fails if one *starts* clearing, so a fix cannot leave a stale complaint
 * behind. The third pins the individual numbers the design pass recorded, so a
 * *silent* shift is caught even where it still clears: a value that moves from
 * 6.69 to 5.20 has changed the palette, and a threshold check alone would let it
 * through.
 */

const INK = NEUTRALS.background.hex;
const TOLERANCE = 0.01;

describe("shipped pairings", () => {
  // Vitest's `it.each([])` registers nothing and the suite passes green, so every
  // table in this file is floored: an emptied list must fail rather than vanish.
  it("has the whole shipped list to walk", () => {
    expect(PAIRINGS.length).toBeGreaterThanOrEqual(39);
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

  it("names each pairing exactly once", () => {
    const ids = PAIRINGS.map((pairing) => pairing.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * The other half of the ledger: what the library ships and does not clear.
 *
 * The assertion is that each entry still *fails*, which is the part that keeps
 * the list honest. A shortfall recorded and then quietly fixed would otherwise
 * sit here for ever describing a problem that no longer exists; this way the
 * retune that fixes it breaks the test and forces the entry into `PAIRINGS`,
 * where it belongs once it passes.
 */
describe("known shortfalls", () => {
  it("has shortfalls to check, and none of them hiding in PAIRINGS", () => {
    expect(KNOWN_SHORTFALLS.length).toBeGreaterThanOrEqual(3);
    const shipped = new Set(PAIRINGS.map((pairing) => pairing.id));
    for (const shortfall of KNOWN_SHORTFALLS) {
      expect(shipped.has(shortfall.id)).toBe(false);
    }
  });

  it.each(KNOWN_SHORTFALLS.map((shortfall) => [shortfall.id, shortfall] as const))(
    "%s still misses its threshold",
    (_id, shortfall) => {
      const ratio = measure(shortfall);
      expect(
        ratio,
        `${shortfall.foreground.token} on ${shortfall.background.token} now clears ${shortfall.threshold}:1 — move it into PAIRINGS`,
      ).toBeLessThan(shortfall.threshold);
      expect(Math.abs(ratio - shortfall.measured)).toBeLessThanOrEqual(TOLERANCE);
    },
  );
});

/** The four fills come from the button recipe on `ref/brand-palette-design-pass`. */
const PINNED_RATIOS: [string, string, string, number][] = [
  ["valor-strong under dark ink", YTY_FAMILIES.valor.strong, INK, 6.69],
  ["harmony-strong under dark ink", YTY_FAMILIES.harmony.strong, INK, 6.11],
  ["glow-strong under dark ink", YTY_FAMILIES.glow.strong, INK, 6.63],
  ["wit-soft under dark ink", YTY_FAMILIES.wit.soft, INK, 8.1],
  ["amber under dark ink", BRAND.primary.hex, INK, 9.58],
  ["white on violet", BRAND.secondary.foreground, BRAND.secondary.hex, 6.43],
  ["the app's ink on the page", NEUTRALS.foreground.hex, INK, 16.0],
];

/** The measurement that made soft the text variant for wit everywhere. */
const WIT_STRONG_ON_GROUNDS: [string, string, number][] = [
  ["the page", NEUTRALS.background.hex, 4.1],
  ["a card", NEUTRALS.card.hex, 3.81],
  ["the muted ground", NEUTRALS.muted.hex, 3.31],
];

/** The numbers the design pass wrote down, recomputed. */
describe("pinned measurements", () => {
  it("has every recorded number to recompute", () => {
    expect(PINNED_RATIOS).toHaveLength(7);
    expect(WIT_STRONG_ON_GROUNDS).toHaveLength(3);
  });

  it.each(PINNED_RATIOS)("%s holds its recorded ratio", (_label, foreground, background, expected) => {
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
  it.each(WIT_STRONG_ON_GROUNDS)(
    "wit-strong on %s clears 3:1 and misses 4.5:1",
    (_label, ground, expected) => {
      const ratio = contrastRatio(YTY_FAMILIES.wit.strong, ground);
      expect(Math.abs(ratio - expected)).toBeLessThanOrEqual(TOLERANCE);
      expect(ratio).toBeGreaterThanOrEqual(3);
      expect(ratio).toBeLessThan(4.5);
    },
  );

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
