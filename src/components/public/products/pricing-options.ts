import {
  BUNDLE_DISCOUNTS,
  BUNDLE_SIZES,
  computeBundleCents,
  computeSubscriptionCents,
  SUBSCRIPTION_DISCOUNTS,
  SUBSCRIPTION_FREQUENCIES,
  type SubscriptionFrequency,
} from "@/lib/constants/pricing";
import type { BillingMode, ProductPrice, ProductType } from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";

// Pure computation of the price options the parent can pick. The detail
// page renders a stacked list and the CTA label reflects the selected
// row. UI-only today — when payment wires up, the same `key` flows
// through to the Stripe Checkout request so the server knows which line
// item to charge.
//
// Authoritative source for amounts is the per-currency row in
// `product_prices` × the platform-wide constants in
// src/lib/constants/pricing.ts. The client never sends a price during
// checkout — the server recomputes from the same constants.

export type PricingOption =
  | { key: "free"; kind: "free" }
  | { key: "external"; kind: "external" }
  | { key: "unavailable"; kind: "unavailable"; currency: string }
  | {
      key: `sub:${SubscriptionFrequency}`;
      kind: "subscription";
      frequency: SubscriptionFrequency;
      totalCents: number;
      savingsPercent: number;
    }
  | {
      key: `bundle:${number}`;
      kind: "bundle";
      bundleSize: number;
      totalCents: number;
      savingsPercent: number;
    }
  | {
      key: "upfront";
      kind: "upfront";
      totalCents: number;
    };

export interface PricingTracks {
  /** Subscribe-style options (consumer clubs only). May be empty. */
  subscriptions: Extract<PricingOption, { kind: "subscription" }>[];
  /** Pay-as-you-go bundle options (consumer clubs only). May be empty. */
  bundles: Extract<PricingOption, { kind: "bundle" }>[];
  /** Single non-tracked option (free / external / upfront / unavailable). */
  single: Extract<
    PricingOption,
    { kind: "free" | "external" | "upfront" | "unavailable" }
  > | null;
  /** Default pre-selection. The most parent-friendly option per type. */
  defaultKey: PricingOption["key"];
}

export interface BuildPricingOptionsArgs {
  prices: readonly ProductPrice[];
  billingMode: BillingMode;
  productType: ProductType;
  currency: SupportedCurrency;
  /** Currency label shown in the "unavailable in {currency}" path. */
  currencyLabel: string;
}

export function buildPricingOptions({
  prices,
  billingMode,
  productType,
  currency,
  currencyLabel,
}: BuildPricingOptionsArgs): PricingTracks {
  if (billingMode === "free") {
    return {
      subscriptions: [],
      bundles: [],
      single: { key: "free", kind: "free" },
      defaultKey: "free",
    };
  }

  if (billingMode === "external_contract") {
    return {
      subscriptions: [],
      bundles: [],
      single: { key: "external", kind: "external" },
      defaultKey: "external",
    };
  }

  const row = prices.find((p) => p.currency === currency);
  if (!row) {
    return {
      subscriptions: [],
      bundles: [],
      single: { key: "unavailable", kind: "unavailable", currency: currencyLabel },
      defaultKey: "unavailable",
    };
  }

  if (productType !== "consumer_club") {
    // Camps, events, and municipality clubs (when not free/external) are
    // upfront totals — admin form stores the amount in `price_per_session`.
    return {
      subscriptions: [],
      bundles: [],
      single: { key: "upfront", kind: "upfront", totalCents: row.price_per_session },
      defaultKey: "upfront",
    };
  }

  const subscriptions = SUBSCRIPTION_FREQUENCIES.map((freq) => {
    const totalCents = computeSubscriptionCents(row.price_per_month, freq);
    const savings = SUBSCRIPTION_DISCOUNTS[freq];
    return {
      key: `sub:${freq}` as const,
      kind: "subscription" as const,
      frequency: freq,
      totalCents,
      savingsPercent: Math.round(savings * 100),
    };
  });

  const bundles = BUNDLE_SIZES.map((size) => {
    const totalCents = computeBundleCents(row.price_per_session, size);
    const discount = BUNDLE_DISCOUNTS[size] ?? 0;
    return {
      key: `bundle:${size}` as const,
      kind: "bundle" as const,
      bundleSize: size,
      totalCents,
      savingsPercent: Math.round(discount * 100),
    };
  });

  // Default: quarterly subscription. Sits in the middle of the commitment
  // ladder — better $/session than monthly without asking for a 12-month
  // commitment up front. The parent can downgrade to monthly or upgrade
  // to yearly with one tap.
  return {
    subscriptions,
    bundles,
    single: null,
    defaultKey: "sub:quarterly",
  };
}

export function findOption(
  tracks: PricingTracks,
  key: PricingOption["key"],
): PricingOption | null {
  if (tracks.single && tracks.single.key === key) return tracks.single;
  const sub = tracks.subscriptions.find((o) => o.key === key);
  if (sub) return sub;
  const bundle = tracks.bundles.find((o) => o.key === key);
  if (bundle) return bundle;
  return null;
}
