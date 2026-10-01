import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { INDEXED_LOCALES } from "@/lib/metadata/localized-page";

/*
 * **The canonical and language versions of a page whose words are written
 * per locale** — a Library article, a Team member — the one rule both follow.
 *
 * The URL's locale is the site's, and the page at any locale shows the text
 * `resolveTranslation()` picks there: the reader's locale, then English, then
 * the first written. A locale the author did not write therefore shows
 * another locale's words, and canonicalises to the page of the locale whose
 * words it shows. So only the locales written are language versions, and
 * each of those is its own canonical.
 *
 * **Text in a locale that is not indexed is never canonicalised to.** That
 * locale's page is noindex (`INDEXED_LOCALES`: Klingon, a real locale but an
 * easter egg), so a page showing such text is its own canonical and names no
 * language versions.
 *
 * The page's address at a locale is the caller's: `pathAt` builds it from
 * the pathnames map, so a translated segment and its `hreflang` cannot
 * disagree.
 */

/** One row of the words written per locale: all the rule reads is its locale. */
export interface WrittenRow {
  locale: SupportedLocale;
}

/** Builds the page's path at a locale — `/fi/kirjasto/<slug>`. */
export type TranslatedPagePath = (locale: SupportedLocale) => string;

/** The locale whose words the page shows at `locale`: its own when written, else the fallback's. */
function translatedTextLocale(
  rows: readonly WrittenRow[],
  locale: SupportedLocale,
): SupportedLocale {
  return resolveTranslation(rows, locale)?.locale ?? locale;
}

/** Whether the page at `locale` shows words written in an indexed locale. */
function showsIndexedText(
  rows: readonly WrittenRow[],
  locale: SupportedLocale,
): boolean {
  return INDEXED_LOCALES.includes(translatedTextLocale(rows, locale));
}

/**
 * The locale of the page the one read at `locale` canonicalises to: the
 * locale whose words it shows, or `locale` itself when those words are in a
 * locale that is not indexed.
 */
function translatedCanonicalLocale(
  rows: readonly WrittenRow[],
  locale: SupportedLocale,
): SupportedLocale {
  return showsIndexedText(rows, locale)
    ? translatedTextLocale(rows, locale)
    : locale;
}

/** The canonical path of the page read at `locale`. */
export function translatedCanonicalPath(
  rows: readonly WrittenRow[],
  locale: SupportedLocale,
  pathAt: TranslatedPagePath,
): string {
  return pathAt(translatedCanonicalLocale(rows, locale));
}

/**
 * The language versions the page has: one per indexed locale written, in the
 * site's locale order. The sitemap lists exactly these.
 */
export function translatedPageLocales(
  rows: readonly WrittenRow[],
): SupportedLocale[] {
  return INDEXED_LOCALES.filter((locale) =>
    rows.some((row) => row.locale === locale),
  );
}

/**
 * The `hreflang` set: each written, indexed locale at its own address, and
 * `x-default` at the page a reader in any other language is shown — the one
 * English resolves to, since an unmatched language lands on English. Empty
 * when nothing was written in an indexed locale.
 */
function translatedPageAlternates(
  rows: readonly WrittenRow[],
  pathAt: TranslatedPagePath,
): Record<string, string> {
  const locales = translatedPageLocales(rows);
  if (locales.length === 0) return {};
  return {
    ...Object.fromEntries(locales.map((locale) => [locale, pathAt(locale)])),
    "x-default": translatedCanonicalPath(rows, "en", pathAt),
  };
}

/**
 * The page's `alternates` metadata read at `locale`: its canonical, and its
 * language versions unless the page shows text that is not indexed — such a
 * page is its own canonical, outside the set, so it names none of them.
 */
export function translatedPageMetadataAlternates(
  rows: readonly WrittenRow[],
  locale: SupportedLocale,
  pathAt: TranslatedPagePath,
): { canonical: string; languages?: Record<string, string> } {
  const languages = showsIndexedText(rows, locale)
    ? translatedPageAlternates(rows, pathAt)
    : {};
  return {
    canonical: translatedCanonicalPath(rows, locale, pathAt),
    ...(Object.keys(languages).length > 0 && { languages }),
  };
}
