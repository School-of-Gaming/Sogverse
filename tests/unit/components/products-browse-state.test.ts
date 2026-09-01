import { describe, expect, it } from "vitest";
import {
  browseStateQuery,
  cameFromBrowse,
  listingHrefWithBrowseState,
  withBrowseState,
} from "@/components/public/products/browse-state";

/**
 * **The round trip is the contract.** A card link carries the grid's filter
 * state into the detail URL and the back link rebuilds the listing from it, so
 * what matters is that a grid URL survives the trip out and back unchanged —
 * and that nothing *else* the URL happened to carry survives with it.
 */
describe("carrying browse state through a detail page", () => {
  it("puts a grid's filters back together after the round trip", () => {
    const grid = new URLSearchParams(
      "category=clubs&topic=minecraft&lang=en&days=1,3",
    );
    const detail = new URLSearchParams(
      withBrowseState("/shop/abc", grid).split("?")[1],
    );
    expect(cameFromBrowse(detail)).toBe(true);
    expect(listingHrefWithBrowseState("/shop", detail)).toBe(
      "/shop?category=clubs&topic=minecraft&lang=en&days=1%2C3",
    );
  });

  it("marks an unfiltered grid as a grid all the same", () => {
    // The case the whole marker exists for: no filters to carry, but the reader
    // still came from a listing and must go back to it unnarrowed.
    const detail = new URLSearchParams(
      withBrowseState("/shop/abc", new URLSearchParams()).split("?")[1],
    );
    expect(cameFromBrowse(detail)).toBe(true);
    expect(listingHrefWithBrowseState("/shop", detail)).toBe("/shop");
  });

  it("carries only filter params, never whatever else a URL holds", () => {
    const grid = new URLSearchParams("topic=minecraft&utm_source=newsletter");
    expect(browseStateQuery(grid)).toBe("topic=minecraft");
  });

  it("spells one filter state one way, whatever order it was built in", () => {
    // Chips are tapped in any order and `replaceState` writes them in that
    // order; a link that varied with it would make two identical grids produce
    // two different URLs.
    const a = new URLSearchParams("days=1&category=clubs&topic=minecraft");
    const b = new URLSearchParams("topic=minecraft&category=clubs&days=1");
    expect(browseStateQuery(a)).toBe(browseStateQuery(b));
  });

  it("reads a page with no marker as a cold arrival", () => {
    expect(cameFromBrowse(new URLSearchParams("topic=minecraft"))).toBe(false);
    expect(cameFromBrowse(new URLSearchParams("from=elsewhere"))).toBe(false);
  });
});
