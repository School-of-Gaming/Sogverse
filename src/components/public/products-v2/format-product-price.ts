import { computeSubscriptionCents } from "@/lib/constants/pricing";
import {
  CURRENCY_CONFIG,
  type SupportedCurrency,
} from "@/lib/constants/currency";
import { formatCurrencyFromCents } from "@/lib/utils";
import type { BillingModeV2, ProductPriceV2, ProductTypeV2 } from "@/types";

// Browse-card price preview. Centralising the math here keeps the card
// rendering rule-free: the card switches on `kind` and looks up the
// matching `productBrowse.card.*` i18n key.
//
// Authoritative source for amounts is the per-currency row in
// `product_prices_v2` × the platform-wide constants in
// src/lib/constants/pricing.ts. The client never sends a price during
// checkout — Stripe Checkout creation recomputes from the same constants.

export type ProductPriceLine =
  | { kind: "free" }
  | { kind: "external" }
  | { kind: "bundle_or_sub"; perSession: string; perMonth: string }
  | { kind: "upfront"; total: string }
  | { kind: "unavailable"; currency: string };

export interface FormatPriceArgs {
  prices: readonly ProductPriceV2[];
  billingMode: BillingModeV2;
  productType: ProductTypeV2;
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
    // Show base monthly + base per-session. Bundle/sub discounts surface
    // on the detail / checkout pages (this card is a glance) — that's
    // also why the figure here matches a single drop-in session, not the
    // discounted bundle price.
    return {
      kind: "bundle_or_sub",
      perSession: formatCurrencyFromCents(row.price_per_session, currency, locale),
      perMonth: formatCurrencyFromCents(
        computeSubscriptionCents(row.price_per_month, "monthly"),
        currency,
        locale,
      ),
    };
  }

  // camp / event upfront — the admin form stores the total in
  // price_per_session for upfront_total products (see product-v2-build.ts).
  return {
    kind: "upfront",
    total: formatCurrencyFromCents(row.price_per_session, currency, locale),
  };
}
