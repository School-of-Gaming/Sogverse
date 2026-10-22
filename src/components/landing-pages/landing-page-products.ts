import "server-only";
import { prefetchProductRails } from "@/components/public/products/product-rail-prefetch";
import type {
  ProductRailPrefetch,
  ProductRailSelection,
} from "@/components/public/products/product-rail-selection";
import { LANDING_PRODUCT_TYPES, type LandingSection } from "@/lib/landing-pages/sections";

/** Each products section's picks, as the shared rail pipeline takes them. */
export function landingProductSelections(
  sections: readonly LandingSection[],
): ProductRailSelection[] {
  return sections.flatMap((section) =>
    section.type === "products"
      ? [{ kind: "picks" as const, productIds: section.productIds }]
      : [],
  );
}

/**
 * The listing of every product type and seat counts for every products section
 * of a page, in one read of each — the shared rail prefetch over
 * `LANDING_PRODUCT_TYPES`, with the request's own client
 * (`product-rail-prefetch.ts` says why a failure seeds nothing). It seeds the
 * cache entry keyed on those types, never the shop's own, which holds the
 * shop's three types alone. A page with no products section reads nothing,
 * and answers null like a failed read: no section is there to be seeded.
 */
export async function prefetchLandingProducts(
  sections: readonly LandingSection[],
): Promise<ProductRailPrefetch | null> {
  const selections = landingProductSelections(sections);
  return selections.length === 0
    ? null
    : prefetchProductRails(LANDING_PRODUCT_TYPES, selections);
}
