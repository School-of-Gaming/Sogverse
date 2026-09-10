import { describe, expect, it } from "vitest";
import {
  browseStateQuery,
  cameFromBrowse,
  listingHrefWithBrowseState,
  withBrowseState,
} from "@/components/public/products/browse-state";

import type { AppHrefObject } from "@/lib/constants/routes";

/** A fixture card's detail destination — a real route, with a real param. */
const DETAIL_HREF = {
  pathname: "/shop/[id]",
  params: { id: "abc" },
} as const;

/**
 * The query a detail href came away with, as the page would read it back.
 * `withBrowseState` always sets one, so the empty fallback is unreachable and
 * is here only because the href type allows an object with no query at all.
 */
function detailQuery(href: AppHrefObject): URLSearchParams {
  return new URLSearchParams(
    Object.entries(href.query ?? {}).map(([k, v]) => [k, String(v)]),
  );
}

/**
 * **The round trip is the contract.** A card link carries the grid's filter
 * state into the detail URL and the back link rebuilds the listing from it, so
 * what matters is that a grid URL survives the trip out and back unchanged —
 * and that nothing *else* the URL happened to carry survives with it.
 */
describe("carrying browse state through a detail page", () => {
  it("puts a grid's filters back together after the round trip", () => {
    const grid = new URLSearchParams(
      "category=clubs&topic=minecraft&price=free&lang=en&days=1,3",
    );
    const detail = detailQuery(withBrowseState(DETAIL_HREF, grid));
    expect(cameFromBrowse(detail)).toBe(true);
    expect(
      listingHrefWithBrowseState({ pathname: "/shop" }, detail),
    ).toEqual({
      pathname: "/shop",
      query: {
        category: "clubs",
        topic: "minecraft",
        price: "free",
        lang: "en",
        days: "1,3",
      },
    });
  });

  it("marks an unfiltered grid as a grid all the same", () => {
    // The case the whole marker exists for: no filters to carry, but the reader
    // still came from a listing and must go back to it unnarrowed.
    const detail = detailQuery(
      withBrowseState(DETAIL_HREF, new URLSearchParams()),
    );
    expect(cameFromBrowse(detail)).toBe(true);
    expect(
      listingHrefWithBrowseState({ pathname: "/shop" }, detail),
    ).toEqual({ pathname: "/shop", query: {} });
  });

  it("carries only filter params, never whatever else a URL holds", () => {
    const grid = new URLSearchParams("topic=minecraft&utm_source=newsletter");
    expect(browseStateQuery(grid)).toEqual({ topic: "minecraft" });
  });

  it("spells one filter state one way, whatever order it was built in", () => {
    // Chips are tapped in any order and `replaceState` writes them in that
    // order; a link that varied with it would make two identical grids produce
    // two different URLs.
    const a = new URLSearchParams("days=1&category=clubs&topic=minecraft");
    const b = new URLSearchParams("topic=minecraft&category=clubs&days=1");
    // Key order is what "one way" means now that the query is an object:
    // `Object.keys` follows insertion order, and both grids must produce the
    // same one.
    expect(Object.keys(browseStateQuery(a))).toEqual(
      Object.keys(browseStateQuery(b)),
    );
    expect(browseStateQuery(a)).toEqual(browseStateQuery(b));
  });

  it("reads a page with no marker as a cold arrival", () => {
    expect(cameFromBrowse(new URLSearchParams("topic=minecraft"))).toBe(false);
    expect(cameFromBrowse(new URLSearchParams("from=elsewhere"))).toBe(false);
  });
});
