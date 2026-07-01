import { describe, it, expect } from "vitest";
import {
  purchaseShapeFor,
  type PricingOption,
} from "@/components/public/products/pricing-options";

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
