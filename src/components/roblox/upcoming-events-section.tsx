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
 * Both reads sit inside a single try/catch with empty fallbacks (mirroring the
 * shop page): on any failure the page still renders — the section falls back to
 * its own empty state and the client hooks refetch on mount — so a prefetch
 * that misses costs the first frame's data rather than the page.
 */
async function getInitialProgrammeData(): Promise<{
  products: ProductBrowseRow[];
  counts: ParticipationCounts[];
}> {
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
    return { products: [], counts: [] };
  }
}

/** The data shell around the presentational "Upcoming Events" section. */
export async function UpcomingEventsSection() {
  const { products, counts } = await getInitialProgrammeData();
  return (
    <UpcomingEventsBrowse initialProducts={products} initialCounts={counts} />
  );
}
