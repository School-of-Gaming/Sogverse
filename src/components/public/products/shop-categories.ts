// Pure shop-category constants + parser. Deliberately NOT a "use client"
// module: the shop page's Server Component (`shop/page.tsx`) imports
// SHOP_PRODUCT_TYPES from here to drive its server-side prefetch. Importing a
// runtime value from a "use client" file into a Server Component yields a
// client-reference placeholder, not the real array — so these live in a plain
// module. The `useShopCategory` hook (client) re-exports them from
// `use-shop-category.ts`, so existing client imports keep working.
//
// The shop browses one product category at a time — the parent must pick one
// (Clubs or Camps); there is no "all" view. State lives in the `?category=`
// query param so a chosen view is shareable/bookmarkable and survives the
// back button. Defaults to "clubs" when the param is absent or unrecognized.
//
// Events are intentionally NOT a category in this version (see shop-browse.tsx).
// The `category` param name + values are mirrored by the back-link helpers in
// `routes.ts` (ROUTES.shopBrowse) — keep the two in sync.

import type { ProductType } from "@/types";

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

export const CATEGORY_PARAM = "category";

export function parseCategory(raw: string | null): ShopCategory {
  return SHOP_CATEGORIES.find((c) => c === raw) ?? DEFAULT_SHOP_CATEGORY;
}
