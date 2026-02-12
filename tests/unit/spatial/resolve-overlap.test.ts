import { describe, it, expect } from "vitest";
import { resolveOverlap } from "@/lib/constants/spatial";
import { AVATAR_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT } from "@/lib/constants/spatial.config";

const MIN_SEP = Math.ceil(AVATAR_SIZE * 0.75); // 42px

/** Check that no pair violates the min-separation rule (both axes closer than MIN_SEP). */
function hasExcessiveOverlap(pos: { x: number; y: number }, others: { x: number; y: number }[]) {
  return others.some(
    (o) => Math.abs(pos.x - o.x) < MIN_SEP && Math.abs(pos.y - o.y) < MIN_SEP
  );
}

describe("resolveOverlap", () => {
  it("returns the same position when there are no others", () => {
    const result = resolveOverlap(100, 100, []);
    expect(result).toEqual({ x: 100, y: 100 });
  });

  it("returns the same position when far from others", () => {
    const result = resolveOverlap(100, 100, [{ x: 300, y: 300 }]);
    expect(result).toEqual({ x: 100, y: 100 });
  });

  it("nudges away from a directly overlapping avatar", () => {
    const other = { x: 200, y: 200 };
    const result = resolveOverlap(200, 200, [other]);
    expect(hasExcessiveOverlap(result, [other])).toBe(false);
  });

  it("nudges when partially overlapping (within MIN_SEP in both axes)", () => {
    const other = { x: 200, y: 200 };
    const result = resolveOverlap(210, 210, [other]);
    expect(hasExcessiveOverlap(result, [other])).toBe(false);
  });

  it("does not nudge when separated by MIN_SEP in one axis", () => {
    const other = { x: 200, y: 200 };
    // Separated by exactly MIN_SEP in x — should not nudge
    const result = resolveOverlap(200 + MIN_SEP, 200, [other]);
    expect(result).toEqual({ x: 200 + MIN_SEP, y: 200 });
  });

  it("handles multiple overlapping avatars", () => {
    const others = [
      { x: 200, y: 200 },
      { x: 220, y: 200 },
      { x: 200, y: 220 },
    ];
    const result = resolveOverlap(210, 210, others);
    expect(hasExcessiveOverlap(result, others)).toBe(false);
  });

  it("clamps to the left/top canvas boundary", () => {
    const other = { x: 10, y: 10 };
    const result = resolveOverlap(10, 10, [other]);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
    expect(hasExcessiveOverlap(result, [other])).toBe(false);
  });

  it("clamps to the right/bottom canvas boundary", () => {
    const farX = CANVAS_WIDTH - AVATAR_SIZE;
    const farY = CANVAS_HEIGHT - AVATAR_SIZE;
    const other = { x: farX, y: farY };
    const result = resolveOverlap(farX, farY, [other]);
    expect(result.x).toBeLessThanOrEqual(CANVAS_WIDTH - AVATAR_SIZE);
    expect(result.y).toBeLessThanOrEqual(CANVAS_HEIGHT - AVATAR_SIZE);
  });

  it("resolves chain overlap (pushed into another avatar)", () => {
    // Three avatars in a tight line — resolving one shouldn't land on another
    const others = [
      { x: 200, y: 200 },
      { x: 200 + MIN_SEP, y: 200 },
    ];
    const result = resolveOverlap(200, 200, others);
    expect(hasExcessiveOverlap(result, others)).toBe(false);
  });

  it("prefers the shorter nudge axis", () => {
    // Other at (200, 200), proposed at (210, 230) — closer in y needs more push,
    // closer in x needs less push so should push in x
    const other = { x: 200, y: 200 };
    const result = resolveOverlap(230, 210, [other]);
    // Should have been pushed in x (further in x already) to reach MIN_SEP
    expect(Math.abs(result.x - other.x)).toBeGreaterThanOrEqual(MIN_SEP);
  });
});
