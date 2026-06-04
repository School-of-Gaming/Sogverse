import type { BillingMode, ProductPrice, ProductType } from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";

// Pure computation of the single price option a parent can buy for a product.
// There is exactly one purchase option per type:
//   consumer_club → flat monthly subscription
//   camp / paid event → single upfront total
//   municipality_club → external (invoiced off-site)
//   free product → free
// The detail page renders one row; the same `kind` flows through to the
// create-participation route so the server knows which line item to charge.
//
// Authoritative source for amounts is the per-currency row in `product_prices`.
// The client never sends a price during checkout — the server recomputes from
// the same row.

export type PricingOption =
  | { kind: "free" }
  | { kind: "external" }
  | { kind: "unavailable"; currency: string }
  | { kind: "subscription"; totalCents: number }
  | { kind: "upfront"; totalCents: number };

export interface BuildPricingOptionArgs {
  prices: readonly ProductPrice[];
  billingMode: BillingMode;
  productType: ProductType;
  currency: SupportedCurrency;
  /** Currency label shown in the "unavailable in {currency}" path. */
  currencyLabel: string;
}

export function buildPricingOption({
  prices,
  billingMode,
  productType,
  currency,
  currencyLabel,
}: BuildPricingOptionArgs): PricingOption {
  if (billingMode === "free") return { kind: "free" };
  if (billingMode === "external_contract") return { kind: "external" };

  const row = prices.find((p) => p.currency === currency);
  if (!row) return { kind: "unavailable", currency: currencyLabel };

  if (productType === "consumer_club") {
    // Consumer clubs bill as a flat monthly subscription.
    return { kind: "subscription", totalCents: row.price_cents };
  }

  // Camps and paid events are a single upfront total.
  return { kind: "upfront", totalCents: row.price_cents };
}
