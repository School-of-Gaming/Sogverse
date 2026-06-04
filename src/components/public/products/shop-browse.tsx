"use client";

import type { ProductBrowseRow, SpokenLanguage } from "@/types";
import type { ParticipationCounts } from "@/services/participations";
import { ProductBrowsePage } from "./product-browse-page";
import { CATEGORY_TYPE, useShopCategory } from "./use-shop-category";

// The shop storefront. The required, mutually-exclusive category (Clubs |
// Camps) lives in the URL via useShopCategory and is switched from the "Type"
// row inside the browse filters (see product-browse-filters.tsx). Here it just
// selects which product type the browse grid shows; the grid itself loads every
// shop type at once (see SHOP_PRODUCT_TYPES) and filters down client-side, so
// switching category is instant.
//
// Events and municipality clubs are intentionally not surfaced — see the
// CATEGORY_TYPE map in use-shop-category.ts.
//
// `initialProducts`/`initialCounts` are server-prefetched in `shop/page.tsx`
// and forwarded so the grid paints on the first frame (no spinner). They cover
// every shop type at once, so they stay valid across category switches.
interface ShopBrowseProps {
  initialProducts: ProductBrowseRow[];
  initialCounts: ParticipationCounts[];
  initialSpokenLanguages: SpokenLanguage[];
}

export function ShopBrowse({
  initialProducts,
  initialCounts,
  initialSpokenLanguages,
}: ShopBrowseProps) {
  const { category } = useShopCategory();
  return (
    <ProductBrowsePage
      browseType={CATEGORY_TYPE[category]}
      initialProducts={initialProducts}
      initialCounts={initialCounts}
      initialSpokenLanguages={initialSpokenLanguages}
    />
  );
}
