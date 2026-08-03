import { describe, it, expect } from "vitest";
import { shouldDropStoredPick } from "@/lib/locations/stored-pick";

/**
 * The clear-on-invalid decision, on its own.
 *
 * The product form drops a stored `location_id` the current mode would no
 * longer accept — a deleted venue, a legacy product pinned above site level, a
 * municipality outside the one country an online municipality club may be
 * funded by. That is right, and it is one frame away from being a data-loss
 * bug: the pickable set arrives asynchronously, so a guard that reads "not in
 * the set" without first asking whether the set is *there* wipes a valid venue
 * the moment an admin opens an existing product for editing, and the next save
 * writes the wipe.
 *
 * These cases exist so that failure is a red test rather than a review someone
 * has to catch. The undefined cases are the load-bearing ones.
 */

const HELSINKI = { id: "loc-hki" };
const TAMPERE = { id: "loc-tre" };

describe("shouldDropStoredPick", () => {
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

    // An empty array is a real answer — no venues exist — and is not the same
    // shape as undefined, however alike they look at a call site.
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
