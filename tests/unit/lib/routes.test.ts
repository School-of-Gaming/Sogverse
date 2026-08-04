import { describe, it, expect } from "vitest";
import { ROUTES } from "@/lib/constants/routes";
import {
  CATEGORY_PARAM,
  parseCategory,
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
  // The detail page's "back to listing" target. Every storefront-surfaced type
  // lands on `/shop` with its own category pre-selected; the values must match
  // SHOP_CATEGORIES, which the shop's `?category=` parser accepts.
  const cases: Array<[ProductType, string]> = [
    ["consumer_club", "/shop?category=clubs"],
    ["camp", "/shop?category=camps"],
    ["event", "/shop?category=events"],
  ];

  it.each(cases)("sends %s back to its shop category", (type, expected) => {
    expect(ROUTES.shopBrowse(type)).toBe(expected);
  });

  it.each(cases)("uses a category the shop parser accepts (%s)", (type) => {
    const category = new URL(
      ROUTES.shopBrowse(type),
      "https://example.test",
    ).searchParams.get(CATEGORY_PARAM);
    expect(category).not.toBeNull();
    expect(parseCategory(category)).toBe(category);
  });

  it("falls back to the bare /shop for municipality clubs", () => {
    // Muni clubs aren't in the storefront — they're discovered from /schools,
    // and a muni club opened from there overrides this back link entirely.
    expect(ROUTES.shopBrowse("municipality_club")).toBe("/shop");
  });
});
