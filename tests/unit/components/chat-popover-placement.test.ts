import { describe, expect, it } from "vitest";
import { placeChatPopover } from "@/components/chat/ChatPopover";

/**
 * ============================================================================
 * A chat popover is placed inside the window it is drawn in.
 * ============================================================================
 *
 * The overlay is right-aligned to its trigger and hung above it, which are
 * preferences — and a preference applied without a clamp puts the box off the
 * screen whenever the trigger is near an edge. It was reproduced live: the
 * action bar over a picture at the *start* of an image run sits far enough left
 * that a right-aligned reaction picker begins off the left of the viewport,
 * where it cannot be scrolled back into view because the overlay is `fixed`.
 *
 * The arithmetic is a pure function precisely so it can be pinned here: jsdom
 * has no layout, so the DOM half of this component can only be exercised with
 * every measurement zero, which is the one case that proves nothing.
 *
 * The margin is 8px, the same number the overlay stands off its trigger by.
 */

const GAP = 8;
const VIEWPORT = { width: 360, height: 640 };

describe("the horizontal placement", () => {
  it("right-aligns to the trigger when there is room for it", () => {
    const at = placeChatPopover(
      { top: 400, bottom: 424, right: 320 },
      { width: 240, height: 48 },
      VIEWPORT,
    );
    expect(at.left).toBe(80);
  });

  it("pushes back inside the left edge rather than hanging off it", () => {
    // The reproduction: a small thumbnail at the start of a run, so the bar
    // that anchors the picker is barely inside the log's left edge.
    const at = placeChatPopover(
      { top: 400, bottom: 424, right: 60 },
      { width: 240, height: 48 },
      VIEWPORT,
    );
    expect(at.left).toBe(GAP);
  });

  it("keeps its far edge inside the right one too", () => {
    const at = placeChatPopover(
      { top: 400, bottom: 424, right: 359 },
      { width: 240, height: 48 },
      VIEWPORT,
    );
    expect(at.left).toBe(VIEWPORT.width - GAP - 240);
  });

  it("pins a box too wide for the window to the near edge", () => {
    const at = placeChatPopover(
      { top: 400, bottom: 424, right: 200 },
      { width: 500, height: 48 },
      VIEWPORT,
    );
    expect(at.left).toBe(GAP);
  });
});

describe("the vertical placement", () => {
  it("hangs above the trigger when the whole box fits there", () => {
    const at = placeChatPopover(
      { top: 400, bottom: 424, right: 320 },
      { width: 240, height: 48 },
      VIEWPORT,
    );
    expect(at.top).toBe(400 - GAP - 48);
  });

  it("flips below the trigger rather than being clipped at the top", () => {
    // The log's first message, near the top of the window.
    const at = placeChatPopover(
      { top: 20, bottom: 44, right: 320 },
      { width: 240, height: 200 },
      VIEWPORT,
    );
    expect(at.top).toBe(44 + GAP);
  });

  it("keeps a flipped box off the bottom edge", () => {
    const short = { width: 360, height: 320 };
    const at = placeChatPopover(
      { top: 150, bottom: 170, right: 320 },
      { width: 240, height: 160 },
      short,
    );
    expect(at.top).toBe(short.height - GAP - 160);
  });

  it("pins a box taller than the window to the top, where its first row is", () => {
    const at = placeChatPopover(
      { top: 100, bottom: 124, right: 320 },
      { width: 240, height: 900 },
      VIEWPORT,
    );
    expect(at.top).toBe(GAP);
  });
});
