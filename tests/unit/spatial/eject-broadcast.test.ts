import { describe, it, expect } from "vitest";
import { ejectFromBroadcastZone } from "@/lib/constants/spatial";
import { AVATAR_SIZE, ZONE_RECTS, CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/constants/spatial.config";

const ZONE = ZONE_RECTS.find((z) => z.id === "broadcast")!;

/** Returns true if the avatar rectangle overlaps the broadcast zone rectangle. */
function overlapsZone(x: number, y: number) {
  return (
    x < ZONE.x + ZONE.width &&
    x + AVATAR_SIZE > ZONE.x &&
    y < ZONE.y + ZONE.height &&
    y + AVATAR_SIZE > ZONE.y
  );
}

describe("ejectFromBroadcastZone", () => {
  it("returns unchanged when avatar is far from the zone", () => {
    const result = ejectFromBroadcastZone(100, 300);
    expect(result).toEqual({ x: 100, y: 300 });
  });

  it("returns unchanged when avatar is just outside the left edge", () => {
    // Avatar right edge exactly at zone left edge — no overlap
    const x = ZONE.x - AVATAR_SIZE;
    const result = ejectFromBroadcastZone(x, 50);
    expect(result).toEqual({ x, y: 50 });
  });

  it("returns unchanged when avatar is just outside the right edge", () => {
    // Avatar left edge exactly at zone right edge — no overlap
    const x = ZONE.x + ZONE.width;
    const result = ejectFromBroadcastZone(x, 50);
    expect(result).toEqual({ x, y: 50 });
  });

  it("returns unchanged when avatar is just below the zone", () => {
    const y = ZONE.y + ZONE.height;
    const result = ejectFromBroadcastZone(500, y);
    expect(result).toEqual({ x: 500, y });
  });

  it("ejects avatar fully outside when partially overlapping from the left", () => {
    // Avatar straddles the zone's left edge
    const result = ejectFromBroadcastZone(470, 50);
    expect(overlapsZone(result.x, result.y)).toBe(false);
  });

  it("ejects avatar fully outside when partially overlapping from the right", () => {
    // Avatar straddles the zone's right edge
    const result = ejectFromBroadcastZone(620, 50);
    expect(overlapsZone(result.x, result.y)).toBe(false);
  });

  it("ejects avatar fully outside when partially overlapping from below", () => {
    // Avatar straddles the zone's bottom edge
    const result = ejectFromBroadcastZone(530, 100);
    expect(overlapsZone(result.x, result.y)).toBe(false);
  });

  it("ejects avatar fully outside when fully inside the zone", () => {
    // Avatar centered inside the zone
    const x = ZONE.x + (ZONE.width - AVATAR_SIZE) / 2;
    const y = ZONE.y + (ZONE.height - AVATAR_SIZE) / 2;
    const result = ejectFromBroadcastZone(x, y);
    expect(overlapsZone(result.x, result.y)).toBe(false);
  });

  it("never ejects upward — pushes to the side instead when near the top", () => {
    // Avatar at top of zone; upward would mean y < 0 or very small
    const result = ejectFromBroadcastZone(530, 0);
    // Should not be pushed above the zone — y should be >= zone bottom or unchanged
    expect(result.y).toBeGreaterThanOrEqual(0);
    // Should have been pushed sideways (left or right), not up
    expect(result.x < ZONE.x - AVATAR_SIZE + 1 || result.x >= ZONE.x + ZONE.width).toBe(true);
    expect(overlapsZone(result.x, result.y)).toBe(false);
  });

  it("prefers left when that is the shortest push", () => {
    // x=500 is near the left edge; y=20 makes pushDown large (90px)
    // pushLeft = 500 - (485 - 56) = 71, pushDown = 110 - 20 = 90 → left wins
    const result = ejectFromBroadcastZone(500, 20);
    expect(result.x).toBeLessThan(ZONE.x);
  });

  it("prefers right when avatar is in the right half of the zone", () => {
    const result = ejectFromBroadcastZone(610, 50);
    expect(result.x).toBeGreaterThanOrEqual(ZONE.x + ZONE.width);
  });

  it("prefers down when avatar is centered horizontally but low in the zone", () => {
    // Centered in x, near the bottom edge — down is the shortest push
    const x = ZONE.x + (ZONE.width - AVATAR_SIZE) / 2;
    const y = ZONE.y + ZONE.height - 10;
    const result = ejectFromBroadcastZone(x, y);
    expect(result.y).toBeGreaterThanOrEqual(ZONE.y + ZONE.height);
  });

  it("clamps to canvas bounds after ejection", () => {
    const result = ejectFromBroadcastZone(500, 50);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.x).toBeLessThanOrEqual(CANVAS_WIDTH - AVATAR_SIZE);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeLessThanOrEqual(CANVAS_HEIGHT - AVATAR_SIZE);
  });
});
