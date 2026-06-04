"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CATEGORY_PARAM,
  DEFAULT_SHOP_CATEGORY,
  parseCategory,
  type ShopCategory,
} from "./shop-categories";

// The category constants + parser live in the non-client `shop-categories.ts`
// so the shop page's Server Component can import SHOP_PRODUCT_TYPES for its
// prefetch (a "use client" module's runtime values don't survive import into a
// Server Component). Re-exported here so existing client imports of these names
// from `use-shop-category` keep working.
export {
  SHOP_CATEGORIES,
  DEFAULT_SHOP_CATEGORY,
  CATEGORY_TYPE,
  SHOP_PRODUCT_TYPES,
  type ShopCategory,
} from "./shop-categories";

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
