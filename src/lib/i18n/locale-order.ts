import {
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";

/**
 * Compares two locale codes in the app's one fixed language order:
 * `SUPPORTED_LOCALES` order first, then any code the app does not ship (the
 * database accepts any locale-shaped code), those by code. The order is total,
 * so sorting by it, or taking the earliest by it, never depends on the order
 * the rows arrived in.
 */
export function compareLocales(a: string, b: string): number {
  const rank = (code: string) =>
    isSupportedLocale(code)
      ? SUPPORTED_LOCALES.indexOf(code)
      : SUPPORTED_LOCALES.length;
  return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * The rows of content written per locale that the app can show, in
 * `SUPPORTED_LOCALES` order — the order a list of a thing's written versions
 * (editor tabs, version lists, hreflang alternates) is shown in. A locale the
 * app no longer ships is dropped here rather than typed as one it does.
 */
export function inLocaleOrder<T extends { locale: string }>(
  rows: readonly T[],
): (T & { locale: SupportedLocale })[] {
  const supported = rows.filter(
    (row): row is T & { locale: SupportedLocale } => isSupportedLocale(row.locale),
  );
  return supported.sort((a, b) => compareLocales(a.locale, b.locale));
}
