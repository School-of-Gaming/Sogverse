import { prefetchProductRails } from "@/components/public/products/product-rail-prefetch";
import { productRailSeed } from "@/components/public/products/product-rail-selection";
import { SHOP_PRODUCT_TYPES } from "@/components/public/products/shop-categories";
import { PROGRAMME_RAIL_SELECTION } from "./programme-filters";
import { UpcomingEventsBrowse } from "./upcoming-events-browse";

/**
 * The data shell around the presentational "Upcoming Events" section: the
 * shared product rail prefetch (`product-rail-prefetch.ts`) over the shop's
 * listing, asked about the programme's slice alone, seeding the rail's live
 * query — the storefront's own cache entry.
 *
 * Rendered inline, with no Suspense boundary — a deliberate trade. The route's
 * HTML waits on one indexed read (the same one `/shop` makes), and the
 * alternative is a fallback that must hold this section's exact final height or
 * it reintroduces the mid-page shift the layout rules forbid. If this read ever
 * turns perceptibly slow, that is an anomaly to investigate, not a case to
 * design a skeleton for.
 *
 * A failed prefetch seeds nothing (the prefetch says why), and the section
 * still renders: the live query fetches on mount instead.
 */
export async function UpcomingEventsSection() {
  const prefetch = await prefetchProductRails(SHOP_PRODUCT_TYPES, [PROGRAMME_RAIL_SELECTION]);
  return <UpcomingEventsBrowse seed={productRailSeed(prefetch, PROGRAMME_RAIL_SELECTION)} />;
}
