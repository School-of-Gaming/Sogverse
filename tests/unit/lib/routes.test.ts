import { describe, it, expect } from "vitest";
import { ROUTES } from "@/lib/constants/routes";
import type { ProductTypeV2 } from "@/types";

describe("ROUTES.admin.productV2", () => {
  // Each v2 product type has its own admin detail surface — unlike the gedu
  // routes, consumer and municipality clubs do NOT collapse. The admin
  // user-detail "Assigned products" links depend on this mapping.
  const cases: Array<[ProductTypeV2, string]> = [
    ["consumer_club", "/admin/consumer-clubs/p1"],
    ["municipality_club", "/admin/municipality-clubs/p1"],
    ["camp", "/admin/camps/p1"],
    ["event", "/admin/events/p1"],
  ];

  it.each(cases)("maps %s to its admin detail route", (type, expected) => {
    expect(ROUTES.admin.productV2(type, "p1")).toBe(expected);
  });

  it("never targets the dead v1 /admin/products/[id] surface", () => {
    for (const [type] of cases) {
      expect(ROUTES.admin.productV2(type, "p1")).not.toMatch(
        /^\/admin\/products\//,
      );
    }
  });
});
