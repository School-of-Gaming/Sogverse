import {
  computeBundleCents,
  computeSubscriptionCents,
} from "@/lib/constants/pricing";
import {
  CURRENCY_CONFIG,
  type SupportedCurrency,
} from "@/lib/constants/currency";
import { formatCurrencyFromCents } from "@/lib/utils";
import type { BillingModeV2, ProductPriceV2, ProductTypeV2 } from "@/types";

// Browse-card price preview. Centralising the math here keeps the card
// rendering rule-free: the card switches on `kind` and looks up the
// matching `productBrowse.card.from*` i18n key.
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
    // "From" shows the cheapest per-session and per-month figures across
    // discount tiers — i.e. the largest bundle and (for now) monthly.
    // Quarterly is cheaper per month after discount but reads strangely
    // when the parent hasn't picked a frequency yet; we surface that on
    // the detail page later.
    const tenBundleTotal = computeBundleCents(row.price_per_session, 10);
    const perSessionDiscounted = Math.round(tenBundleTotal / 10);
    return {
      kind: "bundle_or_sub",
      perSession: formatCurrencyFromCents(perSessionDiscounted, currency, locale),
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
