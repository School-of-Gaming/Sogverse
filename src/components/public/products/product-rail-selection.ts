import type { ParticipationCounts } from "@/services/participations/participations.service";
import type { ProductBrowseRow } from "@/types";
import { filterProducts, type BrowseFilters } from "./filter-products";

/*
 * **Which of the shop's products a product rail shows** — the one part of the
 * rail pipeline that differs between the surfaces running it.
 *
 * The pipeline is the same everywhere: the server reads the shop's whole
 * listing with the viewer's client and counts seats for the products the rail
 * shows (`product-rail-prefetch.ts`), the client keeps that listing live in
 * the storefront's own cache entry and narrows it again (`use-product-rail.ts`),
 * and the cards are the shop's own, in the rail (`product-rail.tsx`). What a
 * surface brings is a selection, applied to the listing on both sides of that
 * boundary by the one function below, so the server's count and the client's
 * cards are always about the same products.
 *
 * Deliberately NOT a "use client" module: the server prefetch imports these
 * values, and a runtime value imported from a "use client" file into a Server
 * Component is a client-reference placeholder rather than the real thing.
 */

/**
 * A rail's products, as a narrowing of the shop's listing — never a wider set.
 *
 * - `filters` — the shop's own browse filters, matched exactly as the shop
 *   grid matches them; the Roblox page's programme slice.
 * - `picks` — products named by id, shown in the order given: a landing page's
 *   products section. A pick the listing does not hold is not shown, which is
 *   what keeps an ended, unlisted or non-shop product off the page — the
 *   listing is the only visibility rule, and nothing here adds a second one.
 */
export type ProductRailSelection =
  | { kind: "filters"; filters: BrowseFilters }
  | { kind: "picks"; productIds: readonly string[] };

/** The listing's products a selection shows, in the order it shows them. */
export function selectRailProducts(
  listing: readonly ProductBrowseRow[],
  selection: ProductRailSelection,
): ProductBrowseRow[] {
  switch (selection.kind) {
    case "filters":
      return filterProducts(listing, selection.filters);
    case "picks": {
      const listed = new Map(listing.map((product) => [product.id, product]));
      return selection.productIds.flatMap((id) => {
        const product = listed.get(id);
        return product === undefined ? [] : [product];
      });
    }
  }
}

/**
 * What the server prefetch hands a surface: the shop's whole listing, and
 * seat counts covering the products of every selection it was asked about.
 */
export interface ProductRailPrefetch {
  listing: ProductBrowseRow[];
  counts: ParticipationCounts[];
}

/**
 * What one rail's live query is seeded with, or nothing when the prefetch
 * failed. The listing goes over whole, because it seeds the storefront's own
 * cache entry and must hold the set that entry's key promises; the counts are
 * narrowed to the rail's own products, because the counts entry is keyed on
 * exactly those ids.
 */
export interface ProductRailSeed {
  initialListing?: ProductBrowseRow[];
  initialCounts?: ParticipationCounts[];
}

export function productRailSeed(
  prefetch: ProductRailPrefetch | null,
  selection: ProductRailSelection,
): ProductRailSeed {
  if (prefetch === null) return {};
  const shown = new Set(
    selectRailProducts(prefetch.listing, selection).map((product) => product.id),
  );
  return {
    initialListing: prefetch.listing,
    initialCounts: prefetch.counts.filter((count) => shown.has(count.productId)),
  };
}
