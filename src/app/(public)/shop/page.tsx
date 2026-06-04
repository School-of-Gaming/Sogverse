import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ProductsService } from "@/services/products";
import {
  ParticipationsService,
  type ParticipationCounts,
} from "@/services/participations";
import { UsersService } from "@/services/users";
import { ShopBrowse } from "@/components/public/products/shop-browse";
import { SHOP_PRODUCT_TYPES } from "@/components/public/products/shop-categories";
import type { ProductBrowseRow, SpokenLanguage } from "@/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("shop") };
}

/**
 * Server-prefetch everything the storefront's first frame needs with the
 * viewer's RLS-scoped client: every shop-surfaced product (clubs + camps in
 * one fetch), the seat counts keyed on those ids, and the spoken-language
 * reference set (the filter strip's Language row). The results seed React Query
 * via `initialData` (ShopBrowse → ProductBrowsePage → ProductBrowseFilters) so
 * the grid and filters paint fully on the first frame — no spinner, no row
 * popping in late (CLAUDE.md layout-shift rule). The client hooks still refetch
 * on mount; this prefetch only affects the initial render.
 *
 * Wrapped in try/catch with empty fallbacks (mirroring `parent/page.tsx`): on
 * any failure the page still renders and the client hooks refetch on mount.
 * Products + languages run in parallel; counts run after products because the
 * count query is keyed on the product ids.
 */
async function getInitialShopData(): Promise<{
  products: ProductBrowseRow[];
  counts: ParticipationCounts[];
  spokenLanguages: SpokenLanguage[];
}> {
  try {
    const supabase = await createClient();
    const [products, spokenLanguages] = await Promise.all([
      new ProductsService(supabase).listVisibleByTypes(SHOP_PRODUCT_TYPES),
      new UsersService(supabase).getSpokenLanguages(),
    ]);
    const counts = await new ParticipationsService(
      supabase,
    ).getParticipationCounts(products.map((p) => p.id));
    return { products, counts, spokenLanguages };
  } catch {
    return { products: [], counts: [], spokenLanguages: [] };
  }
}

export default async function ShopPage() {
  const { products, counts, spokenLanguages } = await getInitialShopData();
  return (
    <ShopBrowse
      initialProducts={products}
      initialCounts={counts}
      initialSpokenLanguages={spokenLanguages}
    />
  );
}
