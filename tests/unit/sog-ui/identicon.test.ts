import { describe, expect, it } from "vitest";

import { BRAND } from "../../../packages/sog-ui/src/tokens/brand";
import { IDENTICON } from "../../../packages/sog-ui/src/tokens/identicon";

/**
 * What makes the identicon's four work, rather than what they contain.
 *
 * Two of them are not values at all: 1 and 2 are read from the signature pair,
 * so what is worth holding is that they still *are* the pair — a face follows
 * the brand, and a copy of Act's hex typed in here would be a face that stopped
 * following it. The other two are the artwork's own black and white, and those
 * are load-bearing as literals: they are what makes a five-by-five grid read as
 * a pixel face, and pointing either at a neutral is a different drawing.
 *
 * The rest is the set. Four entries with the ids 1 to 4, and no two the same
 * colour — a face whose cells are drawn from a list with a duplicate in it has
 * fewer colours than the list claims, and two people's faces get closer
 * together, which is the one thing the palette exists to prevent.
 */
describe("IDENTICON", () => {
  it("carries the ids 1 to 4, once each", () => {
    expect(IDENTICON.map((colour) => colour.id)).toEqual([1, 2, 3, 4]);
  });

  it("reads the signature pair for its first two", () => {
    expect(IDENTICON[0].hex).toBe(BRAND.act.hex);
    expect(IDENTICON[1].hex).toBe(BRAND.world.hex);
  });

  it("keeps the artwork's own black and white as its last two", () => {
    expect(IDENTICON[2].hex).toBe("#000000");
    expect(IDENTICON[3].hex).toBe("#FFFFFF");
  });

  it("gives every colour one of its own", () => {
    const hexes = IDENTICON.map((colour) => colour.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
  });
});
