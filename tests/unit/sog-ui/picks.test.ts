import { describe, expect, it } from "vitest";

import { PICKS } from "../../../packages/sog-ui/src/tokens/picks";
import { renderTheme } from "../../../packages/sog-ui/src/tokens/generate";

/**
 * What makes the pick list work, rather than what it contains.
 *
 * A test naming pick 7's hex would only restate the value and would fail the
 * day it is retuned, which is a decision rather than a regression. What is
 * load-bearing is the set: sixteen picks, ids that are exactly 1 to 16, and no
 * two the same colour. The last one is the whole point of the palette — a
 * person picks a colour so that theirs is not somebody else's, and two picks
 * sharing a hex would let two people choose what looks like one thing.
 *
 * The theme check is the other half: a pick a consumer cannot spend as a class
 * is a pick that exists only in TypeScript, and the ids are what the class
 * names are built from, so an id that never reaches the stylesheet is a broken
 * choice rather than a missing colour.
 */
describe("PICKS", () => {
  it("carries the ids 1 to 16, once each", () => {
    const ids = PICKS.map((pick) => pick.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  });

  it("gives every pick a colour of its own", () => {
    const hexes = PICKS.map((pick) => pick.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
  });

  it("authors every colour as a six-digit uppercase hex", () => {
    for (const pick of PICKS) {
      expect(pick.hex, `pick ${pick.id}`).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("reaches the generated theme under its own id", () => {
    const theme = renderTheme();
    for (const pick of PICKS) {
      expect(theme, `pick ${pick.id}`).toContain(
        `--color-pick-${pick.id}: ${pick.hex};`,
      );
    }
  });
});
