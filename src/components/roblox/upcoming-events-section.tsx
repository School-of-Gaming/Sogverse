import { filterProducts } from "@/components/public/products/filter-products";
import { SHOP_PRODUCT_TYPES } from "@/components/public/products/shop-categories";
import { createClient } from "@/lib/supabase/server";
import {
  ParticipationsService,
  type ParticipationCounts,
} from "@/services/participations";
import { ProductsService } from "@/services/products";
import type { ProductBrowseRow } from "@/types";
import { PROGRAMME_PRODUCT_FILTERS } from "./programme-filters";
import { UpcomingEventsBrowse } from "./upcoming-events-browse";

/**
 * Server-prefetch everything the Upcoming Events grid's first frame needs, with
 * the viewer's RLS-scoped client — the storefront's prefetch, narrowed to the
 * one section of this page that has data behind it.
 *
 * Products are fetched un-narrowed (every shop-surfaced type in one read),
 * because that is the set the React Query entry the client seeds is keyed on;
 * the programme narrowing is applied only to decide *which* ids need seat
 * counts, and again client-side for what renders. Counts run after products
 * because the count query is keyed on the product ids — which is also why one
 * catch covers both: a failed product read leaves nothing to count.
 *
 * On failure this returns `null` and **nothing is seeded** — deliberately not
 * the shop page's empty-array fallback. The entry being seeded here is the
 * storefront's own cache key, and `initialData` lands fresh for the query
 * provider's staleTime: seeding `[]` after a transient miss would blank the
 * `/shop` grid for a reader who follows this page's CTAs there within that
 * window, while the unseeded hook has no data and genuinely fetches on mount.
 * The page still renders either way — a miss costs this one section's first
 * frame, never the page.
 */
async function getInitialProgrammeData(): Promise<{
  products: ProductBrowseRow[];
  counts: ParticipationCounts[];
} | null> {
  try {
    const supabase = await createClient();
    const products = await new ProductsService(supabase).listVisibleByTypes(
      SHOP_PRODUCT_TYPES,
    );
    const counts = await new ParticipationsService(
      supabase,
    ).getParticipationCounts(
      filterProducts(products, PROGRAMME_PRODUCT_FILTERS).map((p) => p.id),
    );
    return { products, counts };
  } catch {
    return null;
  }
}

/**
 * The data shell around the presentational "Upcoming Events" section.
 *
 * Rendered inline, with no Suspense boundary — a deliberate trade. The route's
 * HTML waits on one indexed read (the same one `/shop` makes), and the
 * alternative is a fallback that must hold this section's exact final height or
 * it reintroduces the mid-page shift the layout rules forbid. If this read ever
 * turns perceptibly slow, that is an anomaly to investigate, not a case to
 * design a skeleton for.
 */
export async function UpcomingEventsSection() {
  const initial = await getInitialProgrammeData();
  return (
    <UpcomingEventsBrowse
      initialProducts={initial?.products}
      initialCounts={initial?.counts}
    />
  );
}
