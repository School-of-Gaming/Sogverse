"use client";

import { useMemo } from "react";
import { filterProducts } from "@/components/public/products/filter-products";
import { SHOP_PRODUCT_TYPES } from "@/components/public/products/shop-categories";
import {
  useParticipationCounts,
  type ParticipationCounts,
} from "@/services/participations";
import { useVisibleProductsByTypes } from "@/services/products";
import type { ProductBrowseRow } from "@/types";
import { PROGRAMME_PRODUCT_FILTERS } from "./programme-filters";
import { UpcomingEvents } from "./upcoming-events";

interface UpcomingEventsBrowseProps {
  /**
   * *Every* shop-surfaced product, server-prefetched — not just the
   * programme's. It seeds the same React Query entry the storefront reads, so
   * it has to hold the same set that entry's key promises; handing over a
   * pre-narrowed list here would poison the shop's cache with a partial one.
   * The programme narrowing happens below instead, client-side.
   */
  initialProducts: ProductBrowseRow[];
  /** Seat counts for the programme's products alone (server-prefetched). */
  initialCounts: ParticipationCounts[];
}

/**
 * Keeps the Upcoming Events grid live, on the storefront's own terms.
 *
 * Same shape as the shop's browse client: one fetch of every shop-surfaced
 * type, narrowed client-side. That is not just symmetry — it is what lets this
 * page and `/shop` share one cache entry, so a reader arriving here from the
 * shop (or leaving for it via the CTAs, which point at the same slice expressed
 * as query params) does not pay for a second round trip.
 *
 * `initialData` on both hooks is the server prefetch, so the grid is fully
 * painted on the first frame — no spinner and no skeleton, because there is no
 * moment when the data is not there. The hooks still refetch on mount; that
 * refetch returns the same rows in the ordinary case and nothing moves.
 *
 * The counts query is keyed on the narrowed ids, and on the first render those
 * are exactly the ids the server counted — so `initialCounts` lands on the key
 * it was built for.
 */
export function UpcomingEventsBrowse({
  initialProducts,
  initialCounts,
}: UpcomingEventsBrowseProps) {
  const { data: allProducts } = useVisibleProductsByTypes(SHOP_PRODUCT_TYPES, {
    initialData: initialProducts,
  });

  const products = useMemo(
    () => filterProducts(allProducts ?? [], PROGRAMME_PRODUCT_FILTERS),
    [allProducts],
  );

  const productIds = useMemo(() => products.map((p) => p.id), [products]);
  const { data: counts } = useParticipationCounts(productIds, {
    initialData: initialCounts,
  });

  return <UpcomingEvents products={products} counts={counts ?? []} />;
}
