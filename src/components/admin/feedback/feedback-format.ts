/**
 * A share as a whole percentage in the reader's locale, or a dash where there
 * is nothing to divide. Whole numbers because the page's counts are small
 * enough that a decimal would claim a precision none of them has.
 */
export function formatShare(share: number | null, locale: string): string {
  if (share === null) return "—";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(share);
}
