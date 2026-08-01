import { describe, expect, it } from "vitest";
import { resolveScrollCompensation } from "@/components/gedu/session-feed/scroll-anchor";

/**
 * The feed changes height where the reader is not looking — the future horizon
 * reveals upward, and an editor collapses shut on a card the reader has already
 * moved past. Both are corrected by moving the scroll position by exactly as
 * much as the chosen anchor moved, so nothing painted appears to move at all.
 *
 * Which element is the anchor is a design decision made at the call site (the
 * divider for a reveal; the card *below* the one being edited for a collapse,
 * because that is where the eye is on a save). The measurement half is the
 * DOM's. This is the arithmetic half, and it exists as a function because of
 * one asymmetry worth pinning: a page can always absorb an insertion (it just
 * grew by the amount the scroll has to travel) and cannot always absorb a
 * removal (there may not be that much scroll left above it). The leftover is a
 * shift the reader *will* see, and it is reported rather than swallowed.
 */
describe("resolveScrollCompensation", () => {
  it("follows an anchor pushed down the viewport", () => {
    // Revealing the future inserts height above the divider, so the divider
    // moves down and the page has to scroll down by the same amount.
    expect(resolveScrollCompensation(1200, 3000)).toEqual({
      nextScrollY: 4200,
      shortfall: 0,
    });
  });

  it("follows an anchor pulled up the viewport", () => {
    // An editor collapsing takes height out above the anchor, so the card below
    // the edited one rides up and the scroll gives the same distance back.
    expect(resolveScrollCompensation(4200, -3000)).toEqual({
      nextScrollY: 1200,
      shortfall: 0,
    });
  });

  it("does nothing when nothing moved", () => {
    expect(resolveScrollCompensation(800, 0)).toEqual({
      nextScrollY: 800,
      shortfall: 0,
    });
  });

  /**
   * The documented edge: a feed near the top of the document. There is not
   * enough scroll above it to give back, so the page lands at its own top and
   * the rest of the correction simply cannot happen. Nothing here can fix that
   * — no browser scrolls above zero — so the honest answer is a partial shift
   * with the remainder named. It is also the *only* case where a compensated
   * change still moves the anchor, which is why it is named rather than
   * clamped silently.
   */
  it("stops at the top of the document and says how much it could not absorb", () => {
    expect(resolveScrollCompensation(400, -3000)).toEqual({
      nextScrollY: 0,
      shortfall: 2600,
    });
  });

  it("treats a page already at the top as absorbing nothing at all", () => {
    expect(resolveScrollCompensation(0, -500)).toEqual({
      nextScrollY: 0,
      shortfall: 500,
    });
  });

  it("keeps sub-pixel corrections rather than rounding them away", () => {
    // Fractional device pixels are ordinary at non-integer zoom, and dropping
    // them would leave a visible drift over a run of corrections.
    expect(resolveScrollCompensation(100.25, 12.5).nextScrollY).toBeCloseTo(
      112.75,
    );
  });
});
