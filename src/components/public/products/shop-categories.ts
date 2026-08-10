// Pure shop-category constants + parser. Deliberately NOT a "use client"
// module: the shop page's Server Component (`shop/page.tsx`) imports
// SHOP_PRODUCT_TYPES from here to drive its server-side prefetch. Importing a
// runtime value from a "use client" file into a Server Component yields a
// client-reference placeholder, not the real array — so these live in a plain
// module. The `useShopCategories` hook (client) re-exports them from
// `use-shop-categories.ts`, so existing client imports keep working.
//
// The shop shows every category at once. Type is an *inclusive* filter, not a
// choice: an empty selection is the default and means "all of them", and
// selecting chips narrows to those categories. State lives in the `?category=`
// query param as a comma-separated list (`?category=clubs,camps`) so a chosen
// view is shareable/bookmarkable and survives the back button; the default
// drops the param entirely, keeping `/shop` canonical. A single-value link
// (`?category=clubs` — what `routes.ts` emits, and what old bookmarks carry)
// parses as a one-category selection, so those keep working unchanged.
//
// The `category` param name + values are mirrored by the back-link helpers in
// `routes.ts` (ROUTES.shopBrowse) — keep the two in sync.

import type { ProductType } from "@/types";

export const SHOP_CATEGORIES = ["clubs", "camps", "events"] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

// Each shop category maps to exactly one product type. Municipality clubs are
// deliberately absent — they are discovered location-first from `/schools`, not
// from the storefront. SHOP_PRODUCT_TYPES is the set fetched for the browse
// grid; the selected categories narrow that set down client-side.
export const CATEGORY_TYPE: Record<ShopCategory, ProductType> = {
  clubs: "consumer_club",
  camps: "camp",
  events: "event",
};
export const SHOP_PRODUCT_TYPES: ProductType[] = Object.values(CATEGORY_TYPE);

export const CATEGORY_PARAM = "category";

function isShopCategory(raw: string): raw is ShopCategory {
  return SHOP_CATEGORIES.some((c) => c === raw);
}

/**
 * The categories a `?category=` param selects. Unknown tokens are dropped so a
 * hand-edited or stale URL can't surface a category the shop never offered, and
 * a param made entirely of them reads as no selection at all — i.e. the default
 * "everything" view rather than an empty page. The result is deduped and in
 * SHOP_CATEGORIES order, so `?category=events,clubs,clubs` normalises to
 * `["clubs", "events"]` and the param the shop writes back is canonical.
 */
export function parseCategories(raw: string | null): ShopCategory[] {
  if (!raw) return [];
  const selected = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(isShopCategory),
  );
  return SHOP_CATEGORIES.filter((c) => selected.has(c));
}

/**
 * The categories whose sections actually render. An empty selection means the
 * parent hasn't narrowed anything, which shows all of them — so this is the one
 * place that expansion happens, rather than each caller re-deriving it.
 */
export function visibleCategories(
  selected: readonly ShopCategory[],
): readonly ShopCategory[] {
  return selected.length > 0 ? selected : SHOP_CATEGORIES;
}
