import { describe, it, expect } from "vitest";
import { ROUTES } from "@/lib/constants/routes";
import {
  CATEGORY_PARAM,
  CATEGORY_TYPE,
  SHOP_CATEGORIES,
  parseCategories,
} from "@/components/public/products/shop-categories";
import {
  PROGRAMME_LANGUAGE,
  PROGRAMME_TOPIC,
} from "@/components/roblox/programme-filters";
import { isAudienceFilterValue } from "@/lib/products/product-audience";
import { isSpokenLanguageCode } from "@/lib/constants/spoken-languages";
import { PRODUCT_TOPIC_VALUES } from "@/lib/products/topics";
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

describe("the /roblox programme's shop hrefs", () => {
  // Both constants promise, in a comment, to stay in sync with the browse
  // filter's param grammar. These tests are that promise made mechanical (the
  // same arrangement shopBrowse has above): each emitted param is read back the
  // way the shop reads it, so a renamed param, a retired enum value, or a typo'd
  // href fails here instead of silently degrading to an unfiltered shop.

  it("robloxShop filters to the programme's topic and language", () => {
    const params = new URL(ROUTES.robloxShop, "https://example.test")
      .searchParams;
    // Topic values are matched as lowercase strings against the product's
    // `topic` enum column (see use-browse-filters/filter-products); membership
    // in the enum's own value list is what "recognised" means.
    expect(params.get("topic")).toBe(PROGRAMME_TOPIC);
    expect(PRODUCT_TOPIC_VALUES).toContain(params.get("topic"));
    const lang = params.get("lang");
    expect(lang).toBe(PROGRAMME_LANGUAGE);
    expect(lang !== null && isSpokenLanguageCode(lang)).toBe(true);
  });

  it("robloxParentSessions filters to French products for parents", () => {
    const params = new URL(ROUTES.robloxParentSessions, "https://example.test")
      .searchParams;
    const lang = params.get("lang");
    expect(lang).toBe(PROGRAMME_LANGUAGE);
    expect(lang !== null && isSpokenLanguageCode(lang)).toBe(true);
    const audience = params.get("audience");
    expect(audience !== null && isAudienceFilterValue(audience)).toBe(true);
    expect(audience).toBe("parents");
    // Deliberately not topic-filtered — a parent digital-safety session is not
    // a Roblox Studio product (the route constant's comment owns the why).
    expect(params.get("topic")).toBeNull();
  });
});
