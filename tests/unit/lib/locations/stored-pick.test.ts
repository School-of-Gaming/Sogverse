import { describe, it, expect } from "vitest";
import {
  shouldDropStoredRow,
  type AcceptedLocation,
} from "@/lib/locations/stored-pick";
import type { LocationType } from "@/types";

/**
 * The clear-on-invalid decision, on its own.
 *
 * The product form drops a stored `location_id` the current mode would no
 * longer accept: a deleted site, a legacy product pinned above site level, a
 * municipality outside the one country an online municipality club may be
 * funded by, and a municipality club toggled from online to in-person, which
 * leaves a municipality id in a field that now takes only sites. That is
 * right, and it is one frame away from being a data-loss bug: whatever the
 * control checks against arrives asynchronously, so a guard that answers before
 * it is there wipes a valid location the moment an admin opens an existing
 * product for editing, and the next save writes the wipe.
 *
 * These cases exist so that failure is a red test rather than a review someone
 * has to catch. The `undefined` cases are the load-bearing ones — and so is the
 * case separating `undefined` from `null`, because those are the two answers a
 * keyed lookup can give that look alike and mean opposite things.
 */

const SITES: AcceptedLocation = { types: ["site"] };
const FI_MUNICIPALITIES: AcceptedLocation = {
  types: ["municipality"],
  countryCode: "FI",
};

function row(id: string, type: LocationType, countryCode: string | null = "FI") {
  return { id, type, country_code: countryCode };
}

describe("shouldDropStoredRow (one row by id)", () => {
  describe("while the keyed read has not landed", () => {
    it("keeps a stored value when the row is undefined", () => {
      expect(shouldDropStoredRow("loc-hki", undefined, SITES)).toBe(false);
    });

    // A read that failed also leaves the data undefined, and dropping the value
    // on a network blip would be worse than showing it a moment late.
    it("does not distinguish a pending read from a failed one", () => {
      expect(
        shouldDropStoredRow("a-site-that-was-deleted", undefined, SITES),
      ).toBe(false);
    });

    // The country constraint is no more able to answer early than the level
    // one: an unread row is not a foreign row.
    it("keeps a value when a country-constrained read has not landed", () => {
      expect(shouldDropStoredRow("loc-hki", undefined, FI_MUNICIPALITIES)).toBe(
        false,
      );
    });
  });

  describe("once the read has landed", () => {
    it("keeps a row of an accepted type", () => {
      expect(
        shouldDropStoredRow("loc-hki", row("loc-hki", "site"), SITES),
      ).toBe(false);
    });

    // The everyday case: a municipality club toggled from online to in-person
    // carries its municipality id into a field that only takes sites.
    it("drops a row at a level this control does not accept", () => {
      expect(
        shouldDropStoredRow("loc-hki", row("loc-hki", "municipality"), SITES),
      ).toBe(true);
    });

    // The distinction this guard's shape exists for. A key with no row is a
    // resolved answer — the site was deleted — where a set-membership check
    // could only ever see "absent" and would keep a dangling id forever.
    it("drops a value the read found no row for", () => {
      expect(shouldDropStoredRow("loc-gone", null, SITES)).toBe(true);
    });

    it("accepts any of several types when the control offers several", () => {
      const both: AcceptedLocation = { types: ["municipality", "site"] };
      expect(shouldDropStoredRow("a", row("a", "site"), both)).toBe(false);
      expect(shouldDropStoredRow("a", row("a", "municipality"), both)).toBe(
        false,
      );
      expect(shouldDropStoredRow("a", row("a", "region"), both)).toBe(true);
    });
  });

  describe("with a country constraint", () => {
    it("keeps a right-level row in the right country", () => {
      expect(
        shouldDropStoredRow(
          "loc-hki",
          row("loc-hki", "municipality", "FI"),
          FI_MUNICIPALITIES,
        ),
      ).toBe(false);
    });

    // A French commune is a perfectly well-formed municipality row. It is the
    // *funding rule* that refuses it, which is why the constraint is a business
    // one rather than a shape one.
    it("drops a right-level row in the wrong country", () => {
      expect(
        shouldDropStoredRow(
          "loc-nimes",
          row("loc-nimes", "municipality", "FR"),
          FI_MUNICIPALITIES,
        ),
      ).toBe(true);
    });

    // Legacy data the DB trigger still permits for online muni clubs: a club
    // anchored to a region, or to the country row itself.
    it("drops a Finnish row above the accepted level", () => {
      expect(
        shouldDropStoredRow(
          "loc-uusimaa",
          row("loc-uusimaa", "region", "FI"),
          FI_MUNICIPALITIES,
        ),
      ).toBe(true);
    });

    // The column is denormalised onto every row, so a null there is a broken
    // row rather than a country-less place — and it still cannot satisfy "must
    // be FI".
    it("drops a row with no country when one is required", () => {
      expect(
        shouldDropStoredRow(
          "loc-orphan",
          row("loc-orphan", "municipality", null),
          FI_MUNICIPALITIES,
        ),
      ).toBe(true);
    });

    // Without the constraint the same row is fine anywhere, which is what the
    // site field wants: a school in Lille is as good a site as one in Espoo.
    it("ignores the country when the control does not constrain it", () => {
      expect(
        shouldDropStoredRow("loc-fr", row("loc-fr", "site", "FR"), SITES),
      ).toBe(false);
      expect(
        shouldDropStoredRow("loc-null", row("loc-null", "site", null), SITES),
      ).toBe(false);
    });
  });

  // A read that answered about a different id has said nothing about this one,
  // so it falls back to the absent case rather than to a verdict — the same
  // side of the line every other unresolved state lands on.
  it("treats a row for some other id as no answer at all", () => {
    expect(
      shouldDropStoredRow("loc-hki", row("loc-tre", "municipality"), SITES),
    ).toBe(false);
  });

  describe("when nothing is stored", () => {
    it("has nothing to drop", () => {
      expect(shouldDropStoredRow(null, null, SITES)).toBe(false);
      expect(shouldDropStoredRow(null, undefined, SITES)).toBe(false);
      expect(shouldDropStoredRow(undefined, null, SITES)).toBe(false);
      expect(shouldDropStoredRow("", null, SITES)).toBe(false);
      expect(shouldDropStoredRow(null, null, FI_MUNICIPALITIES)).toBe(false);
    });
  });
});
