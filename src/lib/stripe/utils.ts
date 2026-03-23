import { formatCurrencyFromCents } from "@/lib/utils";
import type { SupportedCurrency } from "@/lib/constants/currency";

/**
 * Compute savings for a package relative to the base rate.
 */
export function getPackageSavings(
  unitAmount: number,
  tokenAmount: number,
  baseRate: number,
): number {
  const basePrice = tokenAmount * baseRate;
  const savings = basePrice - unitAmount;
  return savings > 0 ? savings : 0;
}

/**
 * Convert a token count to a currency display string using a base rate.
 */
export function tokensToCurrencyDisplay(
  tokens: number,
  baseRate: number,
  currency: SupportedCurrency,
  locale: string,
): string {
  return formatCurrencyFromCents(tokens * baseRate, currency, locale);
}
