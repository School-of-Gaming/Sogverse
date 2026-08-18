import { describe, it, expect } from "vitest";
import {
  buildPricingOption,
  purchaseShapeFor,
  type PricingOption,
} from "@/components/public/products/pricing-options";

// buildPricingOption computes the one option a product offers; the FREE branch
// keys on billing_mode alone, so a free camp is free and a paid one priced at
// nothing is still a checkout — the mirror of the browse card's decision.

describe("buildPricingOption", () => {
  it("returns kind=free for a free camp", () => {
    expect(
      buildPricingOption({
        prices: [],
        billingMode: "free",
        productType: "camp",
        currency: "eur",
        currencyLabel: "EUR",
      }),
    ).toEqual({ kind: "free" });
  });

  it("keeps a paid camp with a 0-cent row on the upfront path", () => {
    expect(
      buildPricingOption({
        prices: [{ currency: "eur", price_cents: 0 }],
        billingMode: "paid",
        productType: "camp",
        currency: "eur",
        currencyLabel: "EUR",
      }),
    ).toEqual({ kind: "upfront", totalCents: 0 });
  });
});

// purchaseShapeFor maps the one pricing option a product offers to the purchase
// shape the create-participation route expects. The `external` case is the
// municipality-club fix: it used to return null, which made the Register button
// a no-op (the submit handler bails on a null shape).

describe("purchaseShapeFor", () => {
  it.each<[PricingOption, string]>([
    [{ kind: "subscription", totalCents: 5000 }, "subscription_monthly"],
    [{ kind: "upfront", totalCents: 15000 }, "single_payment"],
    [{ kind: "free" }, "free"],
    [{ kind: "external" }, "external"],
  ])("maps %o to the matching shape", (option, expected) => {
    expect(purchaseShapeFor(option)).toBe(expected);
  });

  it("returns null for an unavailable price (not purchasable in the viewer's currency)", () => {
    expect(purchaseShapeFor({ kind: "unavailable", currency: "USD" })).toBeNull();
  });
});
