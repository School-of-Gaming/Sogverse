import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ParticipationsService } from "@/services/participations/participations.service";
import { ProductsService } from "@/services/products/products.service";
import {
  selectRailProducts,
  type ProductRailPrefetch,
  type ProductRailSelection,
} from "./product-rail-selection";
import { SHOP_PRODUCT_TYPES } from "./shop-categories";

/**
 * Server-prefetch what the first frame of one or more product rails needs,
 * with the viewer's RLS-scoped client — the storefront's own prefetch,
 * narrowed to the rails a page draws.
 *
 * The listing is read un-narrowed (every shop-surfaced type in one read),
 * because that is the set the React Query entry each rail seeds is keyed on;
 * the selections are applied only to decide *which* ids need seat counts, and
 * again client-side for what renders. A page with several rails makes the one
 * listing read and one count read covering all of them. Counts run after the
 * listing because the count query is keyed on its ids — which is also why one
 * catch covers both: a failed listing read leaves nothing to count.
 *
 * On failure this returns `null` and **nothing is seeded** — deliberately not
 * the shop page's empty-array fallback. The entry a rail seeds is the
 * storefront's own cache key, and `initialData` lands fresh for the query
 * provider's staleTime: seeding `[]` after a transient miss would blank the
 * `/shop` grid for a reader who follows a card there within that window, while
 * the unseeded hook has no data and genuinely fetches on mount. The page still
 * renders either way — a miss costs the rails' first frame, never the page.
 */
export async function prefetchProductRails(
  selections: readonly ProductRailSelection[],
): Promise<ProductRailPrefetch | null> {
  try {
    const supabase = await createClient();
    const listing = await new ProductsService(supabase).listVisibleByTypes(
      SHOP_PRODUCT_TYPES,
    );
    const shown = new Set(
      selections.flatMap((selection) =>
        selectRailProducts(listing, selection).map((product) => product.id),
      ),
    );
    const counts = await new ParticipationsService(supabase).getParticipationCounts([
      ...shown,
    ]);
    return { listing, counts };
  } catch {
    return null;
  }
}
