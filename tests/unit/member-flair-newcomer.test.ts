import { describe, expect, it } from "vitest";
import {
  NEWCOMER_WINDOW_DAYS,
  newcomerPresence,
} from "@/components/member-flair/newcomer";

// Every case is anchored to one join instant and a hand-computed "now", so the
// arithmetic is checked against dates a reader can verify rather than against a
// second implementation of the same formula. Nothing here reads the wall clock.
const JOINED = "2026-01-01T00:00:00.000Z";

/** `now` this many days after {@link JOINED}, exactly. */
function daysAfterJoin(days: number): Date {
  return new Date(Date.parse(JOINED) + days * 86_400_000);
}

describe("newcomerPresence", () => {
  it("is fully present on the join day", () => {
    expect(newcomerPresence(JOINED, daysAfterJoin(0))).toEqual({
      opacity: 1,
      daysAgo: 0,
    });
  });

  it("is halfway down the 1.0 → 0.3 fade at the window's midpoint", () => {
    const presence = newcomerPresence(JOINED, daysAfterJoin(15));
    expect(presence?.opacity).toBeCloseTo(0.65, 10);
    expect(presence?.daysAgo).toBe(15);
  });

  it("stays above the floor right up to the window's last moment", () => {
    const presence = newcomerPresence(JOINED, daysAfterJoin(29.9));
    expect(presence?.opacity).toBeGreaterThan(0.3);
    expect(presence?.opacity).toBeLessThan(0.31);
    expect(presence?.daysAgo).toBe(29);
  });

  it("is gone on the window boundary and after it", () => {
    expect(newcomerPresence(JOINED, daysAfterJoin(NEWCOMER_WINDOW_DAYS))).toBeNull();
    expect(newcomerPresence(JOINED, daysAfterJoin(45))).toBeNull();
  });

  it("is gone for a member with no stamp, or an unparseable one", () => {
    const now = daysAfterJoin(1);
    expect(newcomerPresence(null, now)).toBeNull();
    expect(newcomerPresence(undefined, now)).toBeNull();
    expect(newcomerPresence("", now)).toBeNull();
    expect(newcomerPresence("not a date", now)).toBeNull();
  });

  it("clamps a stamp in the future to the join day rather than over-brightening", () => {
    expect(newcomerPresence(JOINED, daysAfterJoin(-7))).toEqual({
      opacity: 1,
      daysAgo: 0,
    });
  });
});
