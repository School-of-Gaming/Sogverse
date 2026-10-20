import type { SupportedCurrency } from "@/lib/constants/currency";
import { formattingLocale } from "@/lib/constants/locales";

export function formatCurrency(
  amount: number,
  currency: SupportedCurrency,
  locale: string,
): string {
  return new Intl.NumberFormat(formattingLocale(locale), {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

export function formatCurrencyFromCents(
  cents: number,
  currency: SupportedCurrency,
  locale: string,
): string {
  return formatCurrency(cents / 100, currency, locale);
}

/**
 * Convert a decimal-string price (e.g. "10.99", "0.5", "100") to integer
 * cents. Returns null for blank / non-numeric / negative input.
 *
 * Used by both the admin pricing preview and the RPC payload builder so
 * that *the number the parent sees and the number Stripe charges agree by
 * construction* — they go through the same conversion.
 *
 * Float precision: `Number("X.XX5") * 100` doesn't round consistently in
 * JS (e.g. `1.005 * 100 = 100.4999…` → 100, but `10.005 * 100 = 1000.5000…1`
 * → 1001). That's acceptable here because every consumer of the cents
 * value runs through this same function, so display and storage agree.
 */
export function decimalToCents(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Add a run of integer cents, refusing to hand back a number that has stopped
 * being one.
 *
 * Money in this app is an integer number of cents precisely so that no total is
 * ever the sum of two roundings. The guard is what makes that a fact rather than
 * an intention: a fee that arrived as a fraction, a count multiplied past
 * `Number.MAX_SAFE_INTEGER`, or anything else that would make the arithmetic
 * silently approximate stops the caller instead of printing a plausible wrong
 * number.
 */
export function sumCents(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new Error(
        `sumCents: running total is not a safe integer (${total})`,
      );
    }
  }
  return total;
}
