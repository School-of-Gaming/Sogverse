import { describe, expect, it } from "vitest";
import {
  SESSION_PHOTO_THUMB_ASPECT_LIMIT,
  SESSION_PHOTO_THUMB_HEIGHT,
  sessionThumbnailWidth,
} from "@/components/session-feed/session-photo-geometry";

/**
 * The thumbnail row's whole geometry is this one function, and nothing
 * downstream measures anything that could correct it: the number it returns is
 * written into the image's `width` attribute, which is what the server's HTML
 * and the browser's first paint both lay the box out from. So the cases worth
 * pinning are the ones that would reach the markup as nonsense — a `NaN` width
 * takes a whole feed row with it — and the clamp that keeps a degenerate stored
 * pair from stretching a row off the page.
 */
describe("sessionThumbnailWidth", () => {
  it("derives the width from the stored ratio at the thumbnail's height", () => {
    // 16:9, the ordinary case: 144 × 16/9.
    expect(sessionThumbnailWidth(1600, 900)).toBe(256);
    // A square is the height.
    expect(sessionThumbnailWidth(1200, 1200)).toBe(SESSION_PHOTO_THUMB_HEIGHT);
    // Portrait 9:16 — narrower than it is tall, and not clamped.
    expect(sessionThumbnailWidth(900, 1600)).toBe(81);
  });

  it("depends on the ratio alone, not on the master's pixel count", () => {
    expect(sessionThumbnailWidth(1600, 900)).toBe(
      sessionThumbnailWidth(3200, 1800),
    );
  });

  it("takes the height it is given", () => {
    expect(sessionThumbnailWidth(1600, 900, 112)).toBe(199);
    expect(sessionThumbnailWidth(1200, 1200, 112)).toBe(112);
  });

  it("rounds to a whole pixel", () => {
    // 144 × 4/3 = 192 exactly; 144 × 1440/810 is 256 to the pixel.
    expect(sessionThumbnailWidth(1440, 1080)).toBe(192);
    expect(Number.isInteger(sessionThumbnailWidth(1441, 1081))).toBe(true);
  });

  it("clamps a degenerate ratio instead of emitting an absurd width", () => {
    const widest = SESSION_PHOTO_THUMB_HEIGHT * SESSION_PHOTO_THUMB_ASPECT_LIMIT;
    const tallest = SESSION_PHOTO_THUMB_HEIGHT / SESSION_PHOTO_THUMB_ASPECT_LIMIT;
    // The table's CHECK permits 4096 × 1; the row must survive it.
    expect(sessionThumbnailWidth(4096, 1)).toBe(widest);
    expect(sessionThumbnailWidth(1, 4096)).toBe(tallest);
    // A shape inside the limit is untouched.
    expect(sessionThumbnailWidth(1600, 900)).toBeLessThan(widest);
  });

  it("answers with a square for a pair that cannot make a ratio", () => {
    for (const [width, height] of [
      [0, 0],
      [1600, 0],
      [-1600, 900],
      [Number.NaN, 900],
      [1600, Number.POSITIVE_INFINITY],
    ]) {
      expect(sessionThumbnailWidth(width, height)).toBe(
        SESSION_PHOTO_THUMB_HEIGHT,
      );
    }
  });
});
