"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
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
  // keeping `/shop` as the canonical URL. `scroll: false` so the tap doesn't
  // jerk the scroll position, matching the filter-chip behavior in
  // use-browse-filters.ts.
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
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [categories, pathname, router, searchParams],
  );

  return { categories, toggleCategory };
}
