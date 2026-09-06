import { describe, expect, it } from "vitest";

import {
  STATUS_IDS,
  YTY_FAMILIES,
} from "../../../packages/sog-ui/src/tokens/brand";
import {
  GROUNDS,
  PAIRINGS,
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
    expect(PAIRINGS.length).toBeGreaterThanOrEqual(40);
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
 * The ledger is complete, which is the claim the whole module rests on.
 *
 * Walking the list proves that what is *in* it passes; it says nothing about
 * what was left out, and a pairing left out is exactly how an unmeasured colour
 * reaches a screen. Every hue the palette offers as a label — the four families
 * and the four statuses — can land on any of the three grounds the theme fills,
 * and every one of them can also be filled under its ink. So the ledger has to
 * carry four entries per hue, and a hue added to either set without its
 * measurements fails here rather than at the first surface that spends it.
 */
const HUE_TOKENS: readonly string[] = [
  ...Object.keys(YTY_FAMILIES).map((id) => `yty-${id}`),
  ...STATUS_IDS,
];

describe("the ledger covers every hue it offers", () => {
  it("has hues to cover", () => {
    expect(HUE_TOKENS.length).toBeGreaterThanOrEqual(8);
  });

  it.each(HUE_TOKENS)("%s is measured as ink on all three grounds", (token) => {
    const grounds = PAIRINGS.filter(
      (pairing) => pairing.foreground.token === token,
    ).map((pairing) => pairing.background.token);
    expect([...grounds].sort()).toEqual(
      GROUNDS.map((ground) => ground.token).sort(),
    );
  });

  it.each(HUE_TOKENS)("%s is measured as a fill under its ink", (token) => {
    const fills = PAIRINGS.filter(
      (pairing) => pairing.background.token === token,
    );
    expect(fills).toHaveLength(1);
  });
});
