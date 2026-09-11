import { describe, it, expect } from "vitest";
import { analyticsRouteFor } from "@/lib/analytics/route";

/**
 * The `route` dimension the analytics mount supplies.
 *
 * Vercel's own Next wrapper computes this in the browser by substituting the
 * current route's param values back out of the pathname. It knows the locale
 * value but not the slug translation, so it would report `/[locale]/kauppa` —
 * one row per language for every translated page, forever. These cases are the
 * three shapes that have to collapse onto one row each.
 */
describe("analyticsRouteFor", () => {
  it("untranslates and un-prefixes a dynamic route to its template", () => {
    expect(analyticsRouteFor("/fi/kauppa/abc")).toBe("/shop/[id]");
  });

  it("reports the same route for every locale of one page", () => {
    expect(analyticsRouteFor("/en/shop")).toBe("/shop");
    expect(analyticsRouteFor("/fi/kauppa")).toBe("/shop");
    expect(analyticsRouteFor("/sv/butik")).toBe("/shop");
    expect(analyticsRouteFor("/fr/boutique")).toBe("/shop");
  });

  it("drops the locale segment from an untranslated dashboard path", () => {
    expect(analyticsRouteFor("/fi/parent")).toBe("/parent");
  });

  it("groups a path behind no route on its locale-stripped form", () => {
    // A 404 in four languages is one miss, not four — and inventing a route
    // template for it would be worse than reporting the path it was asked for.
    expect(analyticsRouteFor("/fi/nothing-here")).toBe("/nothing-here");
  });
});
