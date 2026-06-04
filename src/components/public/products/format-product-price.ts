import {
  CURRENCY_CONFIG,
  type SupportedCurrency,
} from "@/lib/constants/currency";
import { formatCurrencyFromCents } from "@/lib/utils";
import type { BillingMode, ProductPrice, ProductType } from "@/types";

// Browse-card price preview. Centralising the math here keeps the card
// rendering rule-free: the card switches on `kind` and looks up the
// matching `productBrowse.card.*` i18n key.
//
// Authoritative source for amounts is the per-currency row in
// `product_prices` × the platform-wide constants in
// src/lib/constants/pricing.ts. The client never sends a price during
// checkout — Stripe Checkout creation recomputes from the same constants.

export type ProductPriceLine =
  | { kind: "free" }
  | { kind: "external" }
  | { kind: "subscription"; perMonth: string }
  | { kind: "upfront"; total: string }
  | { kind: "unavailable"; currency: string };

export interface FormatPriceArgs {
  prices: readonly ProductPrice[];
  billingMode: BillingMode;
  productType: ProductType;
  currency: SupportedCurrency;
  locale: string;
}

export function formatProductPrice({
  prices,
  billingMode,
  productType,
  currency,
  locale,
}: FormatPriceArgs): ProductPriceLine {
  if (billingMode === "free") return { kind: "free" };
  if (billingMode === "external_contract") return { kind: "external" };

  const row = prices.find((p) => p.currency === currency);
  if (!row) {
    return { kind: "unavailable", currency: CURRENCY_CONFIG[currency].label };
  }

  if (productType === "consumer_club") {
    // Consumer clubs bill as a flat monthly subscription.
    return {
      kind: "subscription",
      perMonth: formatCurrencyFromCents(row.price_cents, currency, locale),
    };
  }

  // camp / event upfront — the single product price.
  return {
    kind: "upfront",
    total: formatCurrencyFromCents(row.price_cents, currency, locale),
  };
}
