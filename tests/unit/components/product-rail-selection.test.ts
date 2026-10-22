import { describe, expect, it } from "vitest";
import {
  productRailSeed,
  selectRailProducts,
} from "@/components/public/products/product-rail-selection";
import { PROGRAMME_RAIL_SELECTION } from "@/components/roblox/programme-filters";
import { browseRow, emptyCounts } from "../../mocks/product-browse-row";

/**
 * **What a product rail shows of the shop's listing.** Both surfaces running
 * the shared rail pipeline narrow the same listing by one function, on the
 * server for the seat counts and on the client for the cards: the Roblox page
 * by its programme's filters, a landing page's products section by its picks,
 * in the admin's order. The listing is the only visibility rule — a pick it
 * does not hold is simply not shown.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const LISTING = [
  browseRow(id(1)),
  browseRow(id(2), { is_remote: false }),
  browseRow(id(3), { topic: "minecraft_java" }),
  browseRow(id(4), { billing_mode: "paid" }),
  browseRow(id(5)),
];

describe("selectRailProducts", () => {
  it("narrows the Roblox programme's rail to its free Roblox Studio products, in any format", () => {
    expect(selectRailProducts(LISTING, PROGRAMME_RAIL_SELECTION).map((p) => p.id)).toEqual([
      id(1),
      id(2),
      id(5),
    ]);
  });

  it("shows picks in the order picked, whatever the listing's order", () => {
    const picks = { kind: "picks", productIds: [id(4), id(1), id(3)] } as const;
    expect(selectRailProducts(LISTING, picks).map((p) => p.id)).toEqual([id(4), id(1), id(3)]);
  });

  it("leaves out a pick the listing does not hold", () => {
    const picks = { kind: "picks", productIds: [id(9), id(2), id(8)] } as const;
    expect(selectRailProducts(LISTING, picks).map((p) => p.id)).toEqual([id(2)]);
    expect(selectRailProducts(LISTING, { kind: "picks", productIds: [id(9)] })).toEqual([]);
  });
});

describe("productRailSeed", () => {
  const prefetch = {
    listing: LISTING,
    counts: [id(1), id(2), id(5)].map(emptyCounts),
  };

  it("seeds the whole listing, and only the counts of the rail's own products", () => {
    const seed = productRailSeed(prefetch, { kind: "picks", productIds: [id(2), id(9)] });
    expect(seed.initialListing).toBe(LISTING);
    expect(seed.initialCounts?.map((c) => c.productId)).toEqual([id(2)]);

    const roblox = productRailSeed(prefetch, PROGRAMME_RAIL_SELECTION);
    expect(roblox.initialCounts?.map((c) => c.productId)).toEqual([id(1), id(2), id(5)]);
  });

  it("seeds nothing when the prefetch failed", () => {
    expect(productRailSeed(null, PROGRAMME_RAIL_SELECTION)).toEqual({});
  });
});
