"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ProductType } from "@/types";

// The shop browses one product category at a time — the parent must pick one
// (Clubs or Camps); there is no "all" view. State lives in the `?category=`
// query param so a chosen view is shareable/bookmarkable and survives the
// back button. Defaults to "clubs" when the param is absent or unrecognized.
//
// Events are intentionally NOT a category in this version (see shop-browse.tsx).
// The `category` param name + values are mirrored by the back-link helpers in
// `routes.ts` (ROUTES.shopBrowse) — keep the two in sync.

export const SHOP_CATEGORIES = ["clubs", "camps"] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];
export const DEFAULT_SHOP_CATEGORY: ShopCategory = "clubs";

// Each shop category maps to exactly one product type. Municipality clubs and
// events are deliberately absent — they are not surfaced in the storefront
// (see shop-browse.tsx). SHOP_PRODUCT_TYPES is the set fetched for the browse
// grid; the selected category filters that set down client-side.
export const CATEGORY_TYPE: Record<ShopCategory, ProductType> = {
  clubs: "consumer_club",
  camps: "camp",
};
export const SHOP_PRODUCT_TYPES: ProductType[] = Object.values(CATEGORY_TYPE);

const CATEGORY_PARAM = "category";

function parseCategory(raw: string | null): ShopCategory {
  return SHOP_CATEGORIES.includes(raw as ShopCategory)
    ? (raw as ShopCategory)
    : DEFAULT_SHOP_CATEGORY;
}

export function useShopCategory() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const category = useMemo(
    () => parseCategory(searchParams.get(CATEGORY_PARAM)),
    [searchParams],
  );

  // Switching category preserves the other query params (the topic/tag/format/
  // language filter chips) — topics and tags are shared reference data across
  // product types, so a chip stays meaningful across the switch. The default
  // category drops the param entirely to keep `/shop` as the canonical URL.
  // `scroll: false` so the tap doesn't jerk the scroll position, matching the
  // filter-chip behavior in use-browse-filters.ts.
  const setCategory = useCallback(
    (next: ShopCategory) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_SHOP_CATEGORY) params.delete(CATEGORY_PARAM);
      else params.set(CATEGORY_PARAM, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { category, setCategory };
}
