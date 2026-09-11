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

/**
 * The pricing decision, before anything is worded.
 *
 * Same four cases as the line above, carrying the raw amount where there is
 * one instead of a formatted string. It exists because two readers want two
 * different halves of this: the card wants the words, and the browse grid's
 * price filter wants only what kind of price a product has and whether it is
 * more than nothing. Splitting the decision from the wording is what lets the
 * filter answer without a locale, a currency formatter, or a second copy of
 * the rules — and what keeps the two answers from ever disagreeing, since the
 * formatter is built on this rather than beside it.
 */
export type ResolvedProductPrice =
  | { kind: "free" }
  | { kind: "unavailable" }
  | { kind: "subscription" | "upfront"; priceCents: number };

export interface ResolvePriceArgs {
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
}

export interface FormatPriceArgs extends ResolvePriceArgs {
  locale: string;
}

/**
 * Whether this product's card states a price at all.
 *
 * The narrowing every price reader has to do first, in one place rather than
 * repeated at each call site. It reads as a type guard because the answer is
 * exactly what makes the formatter's argument type satisfiable: a product this
 * returns true for has a billing mode that names a price, and one it returns
 * false for is billed off-platform and shows how full it is instead. A caller
 * that skips it does not compile, which is the point.
 */
export function statesAPrice<
  T extends { product_type: ProductType; billing_mode: BillingMode },
>(
  product: T,
): product is T & { billing_mode: Exclude<BillingMode, "external_contract"> } {
  return (
    product.product_type !== "municipality_club" &&
    product.billing_mode !== "external_contract"
  );
}

export function resolveProductPrice({
  prices,
  billingMode,
  productType,
  currency,
}: ResolvePriceArgs): ResolvedProductPrice {
  if (billingMode === "free") return { kind: "free" };

  const row = prices.find((p) => p.currency === currency);
  if (!row) return { kind: "unavailable" };

  // Consumer clubs bill as a flat monthly subscription; a paid camp or event
  // is the single product price, paid upfront.
  return {
    kind: productType === "consumer_club" ? "subscription" : "upfront",
    priceCents: row.price_cents,
  };
}

export function formatProductPrice({
  locale,
  ...args
}: FormatPriceArgs): ProductPriceLine {
  const resolved = resolveProductPrice(args);
  switch (resolved.kind) {
    case "free":
      return { kind: "free" };
    case "unavailable":
      return {
        kind: "unavailable",
        currency: CURRENCY_CONFIG[args.currency].label,
      };
    case "subscription":
      return {
        kind: "subscription",
        perMonth: formatCurrencyFromCents(
          resolved.priceCents,
          args.currency,
          locale,
        ),
      };
    case "upfront":
      return {
        kind: "upfront",
        total: formatCurrencyFromCents(
          resolved.priceCents,
          args.currency,
          locale,
        ),
      };
  }
}
