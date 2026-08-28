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
// **There is no external/municipality shape here, and the argument type is what
// keeps it out.** A municipality club's footer shows how full it is rather than
// what it costs, so this formatter is never called for one — and rather than
// leave that as a convention the card could quietly break, `billingMode`
// excludes `external_contract`, so a caller has to narrow before it can ask.
// The card's own muni branch is what does the narrowing. This used to return an
// `external` line that no card could reach, carrying a translated string in
// five locales for a chip nothing rendered.
//
// Authoritative source for amounts is the per-currency row in
// `product_prices`. The client never sends a price during checkout — the
// server recomputes from the same row.

export type ProductPriceLine =
  | { kind: "free" }
  | { kind: "subscription"; perMonth: string }
  | { kind: "upfront"; total: string }
  | { kind: "unavailable"; currency: string };

export interface FormatPriceArgs {
  /** An amount and the currency it is in — the two columns this reads. Asking
   *  for the whole `product_prices` row would make every caller's read carry
   *  timestamps and a foreign key nothing here looks at. */
  prices: readonly Pick<ProductPrice, "currency" | "price_cents">[];
  /**
   * Every billing mode that names a price the card can state. Externally
   * contracted products are excluded at the type level rather than handled
   * below — see the note at the top of this file.
   */
  billingMode: Exclude<BillingMode, "external_contract">;
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

  // paid camp / paid event upfront — the single product price.
  return {
    kind: "upfront",
    total: formatCurrencyFromCents(row.price_cents, currency, locale),
  };
}
