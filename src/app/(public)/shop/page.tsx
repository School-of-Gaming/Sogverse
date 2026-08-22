import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ProductsService } from "@/services/products";
import {
  ParticipationsService,
  type ParticipationCounts,
} from "@/services/participations";
import { ShopBrowse } from "@/components/public/products/shop-browse";
import { SHOP_PRODUCT_TYPES } from "@/components/public/products/shop-categories";
import type { ProductBrowseRow } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("shop") };
}

/**
 * Server-prefetch everything the storefront's first frame needs with the
 * viewer's RLS-scoped client: every shop-surfaced product (clubs + camps +
 * events in one fetch) and the seat counts keyed on those ids. The results seed
 * React Query via `initialData` (ShopBrowse → ProductBrowsePage) so the grid
 * paints fully on the first frame — no spinner (CLAUDE.md layout-shift rule).
 * The client hooks still refetch on mount; this prefetch only affects the
 * initial render.
 *
 * The filter strip's Language row is deliberately absent from this: its
 * vocabulary is the `spoken_language` enum, a compile-time constant since
 * 00199, so the row is complete before any request is made. It used to be a
 * third read here, and the whole reason this function catches — see below.
 *
 * Wrapped in try/catch with empty fallbacks (mirroring `parent/page.tsx`): on
 * any failure the page still renders and the client hooks refetch on mount.
 * Counts run after products because the count query is keyed on the product
 * ids.
 */
async function getInitialShopData(): Promise<{
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
    ).getParticipationCounts(products.map((p) => p.id));
    return { products, counts };
  } catch {
    return { products: [], counts: [] };
  }
}

export default async function ShopPage() {
  const { products, counts } = await getInitialShopData();
  return <ShopBrowse initialProducts={products} initialCounts={counts} />;
}
