import { describe, it, expect } from "vitest";
import { isCurrentSessionPlacement } from "@/lib/voice/locked-session";

/**
 * A locked placement is valid only for its own session window. The comparison
 * is by instant, not string — a timestamptz round-trips with varying formats,
 * so a naive `===` would wrongly reject the same moment (and silently break the
 * roster + auto-confine guards).
 */
describe("isCurrentSessionPlacement", () => {
  it("matches the same instant despite different ISO formats", () => {
    expect(
      isCurrentSessionPlacement("2026-06-16T10:55:00+00:00", "2026-06-16T10:55:00.000Z"),
    ).toBe(true);
  });

  it("matches the same instant across equivalent zone offsets", () => {
    // 10:55Z === 13:55+03:00 — same moment, different wall clock.
    expect(
      isCurrentSessionPlacement("2026-06-16T13:55:00+03:00", "2026-06-16T10:55:00Z"),
    ).toBe(true);
  });

  it("rejects a different instant (a prior session window)", () => {
    expect(
      isCurrentSessionPlacement("2026-06-09T10:55:00Z", "2026-06-16T10:55:00Z"),
    ).toBe(false);
  });

  it("rejects when there is no current window", () => {
    expect(isCurrentSessionPlacement("2026-06-16T10:55:00Z", null)).toBe(false);
  });

  it("rejects an unparseable placement timestamp (NaN never equals)", () => {
    expect(isCurrentSessionPlacement("not-a-date", "2026-06-16T10:55:00Z")).toBe(false);
  });
});
