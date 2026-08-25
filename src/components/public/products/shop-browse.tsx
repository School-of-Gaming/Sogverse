"use client";

import type { ProductBrowseRow } from "@/types";
import type { ParticipationCounts } from "@/services/participations";
import { ProductBrowsePage } from "./product-browse-page";
import { visibleCategories } from "./shop-categories";
import { useShopCategories } from "./use-shop-categories";

// The shop storefront. Type (Clubs | Camps | Events) is an inclusive filter
// living in the URL via useShopCategories, toggled from the "Type" row inside
// the browse filters (see product-browse-filters.tsx). Selecting nothing is the
// default and shows every category; here that selection is expanded into the
// list of sections the browse page renders. The page loads every shop type at
// once (see SHOP_PRODUCT_TYPES) and splits them client-side, so toggling a
// category is instant.
//
// Municipality clubs are intentionally not surfaced here — they are discovered
// location-first from `/schools`. See the CATEGORY_TYPE map in
// shop-categories.ts.
//
// `initialProducts`/`initialCounts` are server-prefetched in `shop/page.tsx`
// and forwarded so the grids paint on the first frame (no spinner). They cover
// every shop type at once, so they stay valid across category toggles.
interface ShopBrowseProps {
  initialProducts: ProductBrowseRow[];
  initialCounts: ParticipationCounts[];
}

export function ShopBrowse({
  initialProducts,
  initialCounts,
}: ShopBrowseProps) {
  const { categories } = useShopCategories();
  return (
    <ProductBrowsePage
      categories={visibleCategories(categories)}
      initialProducts={initialProducts}
      initialCounts={initialCounts}
    />
  );
}
