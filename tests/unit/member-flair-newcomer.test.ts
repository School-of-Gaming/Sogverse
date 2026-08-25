import { describe, expect, it } from "vitest";
import {
  NEWCOMER_WINDOW_DAYS,
  newcomerDaysIn,
  showsNewcomerBadge,
} from "@/components/member-flair/newcomer";
import { Constants, type ProductType } from "@/types";

// Every case is anchored to one join instant and a hand-computed "now", so the
// arithmetic is checked against dates a reader can verify rather than against a
// second implementation of the same formula. Nothing here reads the wall clock.
const JOINED = "2026-01-01T00:00:00.000Z";

/** `now` this many days after {@link JOINED}, exactly. */
function daysAfterJoin(days: number): Date {
  return new Date(Date.parse(JOINED) + days * 86_400_000);
}

describe("newcomerDaysIn", () => {
  it("is zero on the join day", () => {
    expect(newcomerDaysIn(JOINED, daysAfterJoin(0))).toBe(0);
  });

  it("counts whole days, discarding the part-day", () => {
    expect(newcomerDaysIn(JOINED, daysAfterJoin(15))).toBe(15);
    expect(newcomerDaysIn(JOINED, daysAfterJoin(15.99))).toBe(15);
  });

  it("still counts on the window's last moment", () => {
    expect(newcomerDaysIn(JOINED, daysAfterJoin(29.9))).toBe(29);
  });

  it("is gone on the window boundary and after it", () => {
    expect(newcomerDaysIn(JOINED, daysAfterJoin(NEWCOMER_WINDOW_DAYS))).toBeNull();
    expect(newcomerDaysIn(JOINED, daysAfterJoin(45))).toBeNull();
  });

  it("is gone for a member with no stamp, or an unparseable one", () => {
    const now = daysAfterJoin(1);
    expect(newcomerDaysIn(null, now)).toBeNull();
    expect(newcomerDaysIn(undefined, now)).toBeNull();
    expect(newcomerDaysIn("", now)).toBeNull();
    expect(newcomerDaysIn("not a date", now)).toBeNull();
  });

  it("clamps a stamp in the future to the join day rather than going negative", () => {
    expect(newcomerDaysIn(JOINED, daysAfterJoin(-7))).toBe(0);
  });
});

/**
 * The badge's answer for every product type, written out by hand rather than
 * derived, so the expectation is a claim about the product and not a second copy
 * of the implementation.
 *
 * Typed as a total `Record<ProductType, …>`, so a fifth product type fails the
 * type-check here — and the key-set assertion below fails it at *runtime* too,
 * which is the half that vitest alone can see. A new type must therefore be
 * given an answer rather than quietly defaulting to "no badge".
 */
const EXPECTED_BY_PRODUCT_TYPE: Record<ProductType, boolean> = {
  // Both club types badge: they differ only in who pays, which nobody standing
  // in the room can tell apart.
  consumer_club: true,
  municipality_club: true,
  // Everyone starts at once on these, so "new" distinguishes nobody.
  camp: false,
  event: false,
};

describe("showsNewcomerBadge", () => {
  it("badges both club types", () => {
    expect(showsNewcomerBadge("consumer_club")).toBe(true);
    expect(showsNewcomerBadge("municipality_club")).toBe(true);
  });

  it("badges neither camps nor events", () => {
    expect(showsNewcomerBadge("camp")).toBe(false);
    expect(showsNewcomerBadge("event")).toBe(false);
  });

  it("answers for every product type the enum carries, and only those", () => {
    expect([...Object.keys(EXPECTED_BY_PRODUCT_TYPE)].sort()).toEqual(
      [...Constants.public.Enums.product_type].sort(),
    );

    for (const productType of Constants.public.Enums.product_type) {
      expect(showsNewcomerBadge(productType)).toBe(
        EXPECTED_BY_PRODUCT_TYPE[productType],
      );
    }
  });
});
