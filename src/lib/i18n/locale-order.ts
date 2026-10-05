import {
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";

/**
 * The rows of content written per locale that the app can show, in
 * `SUPPORTED_LOCALES` order — the one fixed language order every surface of
 * Library articles, Team profiles and products reads "the first written" in.
 * The database accepts any locale-shaped code, so one the app no longer ships
 * is dropped here rather than typed as one it does. Embedded rows arrive
 * unordered; the order is what makes `resolveTranslation()`'s last step, and
 * so a page's canonical, the same for every read.
 */
export function inLocaleOrder<T extends { locale: string }>(
  rows: readonly T[],
): (T & { locale: SupportedLocale })[] {
  const supported = rows.filter(
    (row): row is T & { locale: SupportedLocale } => isSupportedLocale(row.locale),
  );
  return supported.sort(
    (a, b) =>
      SUPPORTED_LOCALES.indexOf(a.locale) - SUPPORTED_LOCALES.indexOf(b.locale),
  );
}
