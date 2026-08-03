import { describe, expect, it } from "vitest";
import {
  editToggleAnchor,
  resolveScrollCompensation,
} from "@/components/gedu/session-feed/scroll-anchor";

/**
 * The feed changes height where the reader is not looking — the future horizon
 * reveals upward, and an editor collapses shut on a card the reader has already
 * moved past. Both are corrected by moving the scroll position by exactly as
 * much as the chosen anchor moved, so nothing painted appears to move at all.
 *
 * Two halves are pure and pinned here. The **arithmetic** exists as a function
 * because of one asymmetry: a page can always absorb an insertion (it just grew
 * by the amount the scroll has to travel) and cannot always absorb a removal
 * (there may not be that much scroll left above it), so it clamps at the top of
 * the document and the leftover is a shift the reader genuinely sees. The
 * **choice of anchor** is the other half, and it differs by direction. Only the
 * measurement between them belongs to the DOM.
 */
describe("resolveScrollCompensation", () => {
  it("follows an anchor pushed down the viewport", () => {
    // Revealing the future inserts height above the divider, so the divider
    // moves down and the page has to scroll down by the same amount.
    expect(resolveScrollCompensation(1200, 3000)).toBe(4200);
  });

  it("follows an anchor pulled up the viewport", () => {
    // An editor collapsing takes height out above the anchor, so the card below
    // the edited one rides up and the scroll gives the same distance back.
    expect(resolveScrollCompensation(4200, -3000)).toBe(1200);
  });

  it("does nothing when nothing moved", () => {
    expect(resolveScrollCompensation(800, 0)).toBe(800);
  });

  /**
   * The documented edge: a feed near the top of the document. There is not
   * enough scroll above it to give back, so the page lands at its own top and
   * the rest of the correction — 2600px of it here — simply cannot happen.
   * Nothing can fix that; no browser scrolls above zero. It is the only case
   * where a compensated change still moves the anchor, and the clamp is what
   * keeps it from being asked for a negative position instead.
   */
  it("stops at the top of the document rather than asking for a negative scroll", () => {
    expect(resolveScrollCompensation(400, -3000)).toBe(0);
  });

  it("treats a page already at the top as absorbing nothing at all", () => {
    expect(resolveScrollCompensation(0, -500)).toBe(0);
  });

  it("keeps sub-pixel corrections rather than rounding them away", () => {
    // Fractional device pixels are ordinary at non-integer zoom, and dropping
    // them would leave a visible drift over a run of corrections.
    expect(resolveScrollCompensation(100.25, 12.5)).toBeCloseTo(112.75);
  });
});

/**
 * Which row is held is the other half of the decision, and the two directions
 * genuinely want different ones: a close is paid for by the row *below* the
 * edited card, because that is where the reader's eye has gone; an open is paid
 * for by the clicked row itself, because opening one editor shuts another and
 * the shut may be above the button the cursor is still on.
 */
describe("editToggleAnchor", () => {
  /** Three sibling rows in a list, keyed the way the feed keys them. */
  function feedRows(): Map<string, HTMLElement> {
    const list = document.createElement("ol");
    const rows = new Map<string, HTMLElement>();
    for (const id of ["a", "b", "c"]) {
      const row = document.createElement("li");
      list.append(row);
      rows.set(id, row);
    }
    return rows;
  }

  it("anchors a close to the row below the edited one", () => {
    const rows = feedRows();
    expect(editToggleAnchor(rows, "b", true)).toBe(rows.get("c"));
  });

  it("anchors an open to the clicked row itself", () => {
    const rows = feedRows();
    expect(editToggleAnchor(rows, "b", false)).toBe(rows.get("b"));
  });

  it("has nothing to hold when the last row closes", () => {
    // The honest answer: there is no content below it to keep still.
    expect(editToggleAnchor(feedRows(), "c", true)).toBeNull();
  });

  it("still anchors the last row when it opens", () => {
    const rows = feedRows();
    expect(editToggleAnchor(rows, "c", false)).toBe(rows.get("c"));
  });

  it("is a no-op for a row that is not on screen", () => {
    // A revealed-then-hidden chunk leaves ids the map no longer holds.
    expect(editToggleAnchor(feedRows(), "gone", true)).toBeNull();
    expect(editToggleAnchor(feedRows(), "gone", false)).toBeNull();
  });
});
