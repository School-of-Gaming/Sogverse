import { describe, it, expect } from "vitest";
import { ROUTES } from "@/lib/constants/routes";
import {
  CATEGORY_PARAM,
  CATEGORY_TYPE,
  SHOP_CATEGORIES,
  parseCategories,
} from "@/components/public/products/shop-categories";
import type { ProductType } from "@/types";

describe("ROUTES.admin.product", () => {
  // Each v2 product type has its own admin detail surface — unlike the gedu
  // routes, consumer and municipality clubs do NOT collapse. The admin
  // user-detail "Assigned products" links depend on this mapping.
  const cases: Array<[ProductType, string]> = [
    ["consumer_club", "/admin/consumer-clubs/p1"],
    ["municipality_club", "/admin/municipality-clubs/p1"],
    ["camp", "/admin/camps/p1"],
    ["event", "/admin/events/p1"],
  ];

  it.each(cases)("maps %s to its admin detail route", (type, expected) => {
    expect(ROUTES.admin.product(type, "p1")).toBe(expected);
  });

  it("never targets the dead v1 /admin/products/[id] surface", () => {
    for (const [type] of cases) {
      expect(ROUTES.admin.product(type, "p1")).not.toMatch(
        /^\/admin\/products\//,
      );
    }
  });
});

describe("ROUTES.shopBrowse", () => {
  // The detail page's "back to listing" target. Cases are derived from
  // SHOP_CATEGORIES rather than listed by hand, so a category added to the shop
  // without a matching `shopBrowseHref` branch fails here instead of silently
  // sending that type back to the bare `/shop`.
  it.each(SHOP_CATEGORIES)(
    "sends the %s category's product type back to that category",
    (category) => {
      expect(ROUTES.shopBrowse(CATEGORY_TYPE[category])).toBe(
        `/shop?category=${category}`,
      );
    },
  );

  it.each(SHOP_CATEGORIES)(
    "emits a %s param the shop's own parser round-trips",
    (category) => {
      // The back link names one category; the shop's Type filter is a
      // multi-select, so it has to read that single value as a selection of
      // one — not as a stale format it ignores.
      const emitted = new URL(
        ROUTES.shopBrowse(CATEGORY_TYPE[category]),
        "https://example.test",
      ).searchParams.get(CATEGORY_PARAM);
      expect(emitted).not.toBeNull();
      expect(parseCategories(emitted)).toEqual([category]);
    },
  );

  it("falls back to the bare /shop for municipality clubs", () => {
    // Muni clubs aren't in the storefront — they're discovered from /schools,
    // and a muni club opened from there overrides this back link entirely. The
    // derived cases above can't cover this: there is no category to derive it
    // from, which is exactly the point.
    expect(ROUTES.shopBrowse("municipality_club")).toBe("/shop");
  });
});
