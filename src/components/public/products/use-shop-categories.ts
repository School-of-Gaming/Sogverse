"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CATEGORY_PARAM,
  parseCategories,
  SHOP_CATEGORIES,
  type ShopCategory,
} from "./shop-categories";

// The category constants + parser live in the non-client `shop-categories.ts`
// so the shop page's Server Component can import SHOP_PRODUCT_TYPES for its
// prefetch (a "use client" module's runtime values don't survive import into a
// Server Component). Re-exported here so client imports of these names from
// `use-shop-categories` keep working.
export {
  SHOP_CATEGORIES,
  CATEGORY_TYPE,
  SHOP_PRODUCT_TYPES,
  visibleCategories,
  type ShopCategory,
} from "./shop-categories";

export function useShopCategories() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The selected categories, empty when the parent hasn't narrowed — which is
  // the default "everything" view, not an empty result set. Callers that need
  // the rendered set expand it through `visibleCategories`.
  const categories = useMemo(
    () => parseCategories(searchParams.get(CATEGORY_PARAM)),
    [searchParams],
  );

  // Toggling a category preserves the other query params (the topic/format/
  // language/age/day filter chips) — those filters are shared across product
  // types, so a chip stays meaningful across the switch. Turning the last
  // selected category off drops the param entirely, returning to all types and
  // keeping `/shop` as the canonical URL.
  //
  // This is not the only writer of the param: the filter card's "Clear all"
  // resets Type along with the chips, and deletes `category` from inside
  // `useBrowseFilters`'s own write so the whole reset is one `replaceState`
  // (two sequential writes would each rebuild the query string from the same
  // pre-clear snapshot). Anything that changes the param's name or encoding has
  // to look there too.
  //
  // Written via the History API rather than `router.replace`, for the same
  // reason as `use-browse-filters.ts`: the category only drives client-side
  // narrowing of an already-fetched set, and an RSC navigation would re-run the
  // shop page's Supabase prefetch — and light the chip only after that round
  // trip — for a toggle that needs no server data. `useSearchParams()` reflects
  // `replaceState`, so the chip and the sections update synchronously.
  const toggleCategory = useCallback(
    (value: ShopCategory) => {
      // Rebuilt from SHOP_CATEGORIES rather than appended to, so the param
      // stays in canonical order however the chips were tapped.
      const next = SHOP_CATEGORIES.filter((c) =>
        c === value ? !categories.includes(c) : categories.includes(c),
      );
      const params = new URLSearchParams(searchParams.toString());
      if (next.length === 0) params.delete(CATEGORY_PARAM);
      else params.set(CATEGORY_PARAM, next.join(","));
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        qs ? `${pathname}?${qs}` : pathname,
      );
    },
    [categories, pathname, searchParams],
  );

  return { categories, toggleCategory };
}
