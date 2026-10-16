"use client";

import { useMemo } from "react";
import {
  useParticipationCounts,
  type ParticipationCounts,
} from "@/services/participations";
import { useVisibleProductsByTypes } from "@/services/products";
import type { ProductBrowseRow } from "@/types";
import {
  selectRailProducts,
  type ProductRailSeed,
  type ProductRailSelection,
} from "./product-rail-selection";
import { SHOP_PRODUCT_TYPES } from "./shop-categories";

/**
 * Keeps one product rail live, on the storefront's own terms.
 *
 * Same shape as the shop's browse client: one fetch of every shop-surfaced
 * type, narrowed client-side by the rail's selection. That is not just
 * symmetry — it is what lets every rail and `/shop` share one *products* cache
 * entry, so a reader moving between them inside the provider's staleTime reads
 * the list once. (The counts query is keyed on the id set it covers — the
 * rail's own ids here, all ids on `/shop` — so counts are re-fetched per
 * surface; only the product list is shared.)
 *
 * The seed is the server prefetch, so the rail is fully painted on the first
 * frame — no spinner and no skeleton, because there is no moment when the data
 * is not there. Seeded data lands fresh for the provider's staleTime, so there
 * is no immediate mount refetch — deliberate: the SSR payload was fetched
 * moments ago. On the unseeded failure path the hook fetches on mount instead,
 * and what the surface draws may change when that lands — a shift accepted on
 * the anomalous path only, as the price of never freezing a false empty into
 * the shared cache.
 *
 * The counts query is keyed on the selected ids, and on the first render those
 * are exactly the ids the server counted for this rail — so the seed's counts
 * land on the key they were built for.
 */
export function useProductRail(
  selection: ProductRailSelection,
  seed: ProductRailSeed,
): { products: ProductBrowseRow[]; counts: readonly ParticipationCounts[] } {
  const { data: listing } = useVisibleProductsByTypes(SHOP_PRODUCT_TYPES, {
    initialData: seed.initialListing,
  });

  const products = useMemo(
    () => selectRailProducts(listing ?? [], selection),
    [listing, selection],
  );

  const productIds = useMemo(() => products.map((product) => product.id), [products]);
  const { data: counts } = useParticipationCounts(productIds, {
    initialData: seed.initialCounts,
  });

  return { products, counts: counts ?? [] };
}
