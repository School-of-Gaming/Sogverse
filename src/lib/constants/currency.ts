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
  {
    symbol: string;
    label: string;
    /**
     * Stripe's documented minimum charge in this currency, in cents (€0.50 for
     * EUR). The smallest amount a paid product may be priced at.
     *
     * It lives here because it is a fact about the currency at our payment
     * processor, not a policy we chose: Stripe refuses any charge below it with
     * `amount_too_small`. Refusing only a price of zero is therefore not
     * enough — €0.01 to €0.49 are amounts an admin can save and no family can
     * ever buy, because the failure lands at checkout on the customer rather
     * than at validation on the person who typed it.
     */
    minimumChargeCents: number;
  }
> = {
  eur: { symbol: "€", label: "EUR", minimumChargeCents: 50 },
};

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return (
    typeof value === "string" &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
  );
}
