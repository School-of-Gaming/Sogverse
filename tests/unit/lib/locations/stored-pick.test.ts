import { describe, it, expect } from "vitest";
import {
  shouldDropStoredPick,
  shouldDropStoredRow,
} from "@/lib/locations/stored-pick";
import type { LocationType } from "@/types";

/**
 * The clear-on-invalid decision, on its own — in both the shapes the product
 * form needs it.
 *
 * The form drops a stored `location_id` the current mode would no longer
 * accept: a deleted venue, a legacy product pinned above site level, a
 * municipality outside the one country an online municipality club may be
 * funded by, and a municipality club toggled from online to in-person, which
 * leaves a municipality id in a field that now takes only venues. That is
 * right, and it is one frame away from being a data-loss bug: whatever the
 * control checks against arrives asynchronously, so a guard that answers before
 * it is there wipes a valid venue the moment an admin opens an existing product
 * for editing, and the next save writes the wipe.
 *
 * These cases exist so that failure is a red test rather than a review someone
 * has to catch. The `undefined` cases are the load-bearing ones — and in the
 * keyed form, so is the case that separates `undefined` from `null`.
 */

const HELSINKI = { id: "loc-hki" };
const TAMPERE = { id: "loc-tre" };

const VENUE_TYPES: readonly LocationType[] = ["site"];

function row(id: string, type: LocationType) {
  return { id, type };
}

describe("shouldDropStoredPick (the whole pickable set)", () => {
  describe("while the pickable set has not arrived", () => {
    // The whole point. "Not loaded yet" is not an answer, and must never be
    // read as "not a venue".
    it("keeps a stored value when the set is undefined", () => {
      expect(shouldDropStoredPick("loc-hki", undefined)).toBe(false);
    });

    it("keeps it however plausible the value looks", () => {
      expect(shouldDropStoredPick("a-venue-that-was-deleted", undefined)).toBe(
        false,
      );
    });

    // A read that failed also leaves the data undefined, and dropping the value
    // on a network blip would be worse than showing it a moment late.
    it("does not distinguish a pending read from a failed one", () => {
      expect(shouldDropStoredPick("loc-hki", undefined)).toBe(false);
    });
  });

  describe("once the set has arrived", () => {
    it("keeps a value that is in it", () => {
      expect(shouldDropStoredPick("loc-hki", [HELSINKI, TAMPERE])).toBe(false);
    });

    it("drops a value that is not", () => {
      expect(shouldDropStoredPick("loc-deleted", [HELSINKI, TAMPERE])).toBe(
        true,
      );
    });

    // An empty array is a real answer — no municipalities exist — and is not
    // the same shape as undefined, however alike they look at a call site.
    it("drops a value when the set arrived empty", () => {
      expect(shouldDropStoredPick("loc-hki", [])).toBe(true);
    });
  });

  describe("when nothing is stored", () => {
    it("has nothing to drop for null", () => {
      expect(shouldDropStoredPick(null, [HELSINKI])).toBe(false);
      expect(shouldDropStoredPick(null, [])).toBe(false);
      expect(shouldDropStoredPick(null, undefined)).toBe(false);
    });

    it("has nothing to drop for undefined or an empty id", () => {
      expect(shouldDropStoredPick(undefined, [])).toBe(false);
      expect(shouldDropStoredPick("", [])).toBe(false);
    });
  });
});

/**
 * The keyed form, used where there is no set to fetch: the venue field reaches
 * its rows through the tree dialog, so it looks the stored id up on its own and
 * asks what came back.
 */
describe("shouldDropStoredRow (one row by id)", () => {
  describe("while the keyed read has not landed", () => {
    it("keeps a stored value when the row is undefined", () => {
      expect(shouldDropStoredRow("loc-hki", undefined, VENUE_TYPES)).toBe(false);
    });

    // Same reasoning as the set form: a failed read is indistinguishable from
    // an in-flight one, and neither is grounds to wipe a saved venue.
    it("does not distinguish a pending read from a failed one", () => {
      expect(
        shouldDropStoredRow("a-venue-that-was-deleted", undefined, VENUE_TYPES),
      ).toBe(false);
    });
  });

  describe("once the read has landed", () => {
    it("keeps a row of an accepted type", () => {
      expect(
        shouldDropStoredRow("loc-hki", row("loc-hki", "site"), VENUE_TYPES),
      ).toBe(false);
    });

    // The everyday case: a municipality club toggled from online to in-person
    // carries its municipality id into a field that only takes venues.
    it("drops a row at a level this control does not accept", () => {
      expect(
        shouldDropStoredRow(
          "loc-hki",
          row("loc-hki", "municipality"),
          VENUE_TYPES,
        ),
      ).toBe(true);
    });

    // The distinction this second function exists for. A key with no row is a
    // resolved answer — the venue was deleted — where the set form could only
    // ever see "absent" and would keep a dangling id forever.
    it("drops a value the read found no row for", () => {
      expect(shouldDropStoredRow("loc-gone", null, VENUE_TYPES)).toBe(true);
    });

    it("accepts any of several types when the control offers several", () => {
      const both: readonly LocationType[] = ["municipality", "site"];
      expect(shouldDropStoredRow("a", row("a", "site"), both)).toBe(false);
      expect(shouldDropStoredRow("a", row("a", "municipality"), both)).toBe(
        false,
      );
      expect(shouldDropStoredRow("a", row("a", "region"), both)).toBe(true);
    });
  });

  // A read that answered about a different id has said nothing about this one,
  // so it falls back to the absent case rather than to a verdict — the same
  // side of the line every other unresolved state lands on.
  it("treats a row for some other id as no answer at all", () => {
    expect(
      shouldDropStoredRow("loc-hki", row("loc-tre", "municipality"), VENUE_TYPES),
    ).toBe(false);
  });

  describe("when nothing is stored", () => {
    it("has nothing to drop", () => {
      expect(shouldDropStoredRow(null, null, VENUE_TYPES)).toBe(false);
      expect(shouldDropStoredRow(null, undefined, VENUE_TYPES)).toBe(false);
      expect(shouldDropStoredRow(undefined, null, VENUE_TYPES)).toBe(false);
      expect(shouldDropStoredRow("", null, VENUE_TYPES)).toBe(false);
    });
  });
});
