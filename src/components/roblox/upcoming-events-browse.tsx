"use client";

import type { ProductRailSeed } from "@/components/public/products/product-rail-selection";
import { useProductRail } from "@/components/public/products/use-product-rail";
import { PROGRAMME_RAIL_SELECTION } from "./programme-filters";
import { UpcomingEvents } from "./upcoming-events";

/**
 * Keeps the Upcoming Events rail live, through the shared product rail
 * pipeline (`use-product-rail.ts`): the storefront's whole listing, seeded
 * from the server prefetch and narrowed to the programme's slice on this side
 * too, with seat counts for exactly the products shown.
 *
 * An empty slice is a real state here — the page ships before every cohort is
 * scheduled — and it is the frame's to draw, so the products are handed on
 * whatever their number. On the unseeded failure path the section may flip
 * from its empty state to cards when the mount fetch lands, the shift the
 * pipeline accepts on that path alone.
 */
export function UpcomingEventsBrowse({ seed }: { seed: ProductRailSeed }) {
  const { products, counts } = useProductRail(PROGRAMME_RAIL_SELECTION, seed);
  return <UpcomingEvents products={products} counts={counts} />;
}
