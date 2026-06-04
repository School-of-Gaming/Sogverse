// Single source of truth for supported currencies.
//
// The platform is locked to EUR. Admins author prices in EUR, customers see
// EUR, and our records (payments, subscriptions) are in EUR. Stripe Checkout's
// Adaptive Pricing presents each customer their local currency and settles us
// in EUR at the price we set — so "buy in another currency" works without us
// modelling other currencies internally.
//
// This list is the seam for turning multi-currency back on. The data model
// (per-currency `product_prices` rows, `currency` columns) is deliberately
// kept currency-agnostic, so re-enabling is: add currencies here, restore the
// selection UI, and thread the chosen currency through. See the
// "Re-enabling non-EUR currencies" section in TODO.md.
export const SUPPORTED_CURRENCIES = ["eur"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
export const DEFAULT_CURRENCY: SupportedCurrency = "eur";

export const CURRENCY_CONFIG: Record<
  SupportedCurrency,
  { symbol: string; label: string }
> = {
  eur: { symbol: "€", label: "EUR" },
};

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return (
    typeof value === "string" &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
  );
}
