// Pick the version of a piece of authored content to show a reader.
//
// Content written per locale is stored as one row per (thing, locale), and an
// author decides which locales to write: not every thing has every locale.
// The pick is:
//
//   1. The reader's locale.
//   2. English (en).
//   3. The earliest written locale in the app's locale order —
//      `SUPPORTED_LOCALES` order, then any code the app does not ship, by code.
//
// English is second because it is the language most of our readers share; fi
// is deliberately not special — it carries no more guarantee than any other
// locale. The order the rows arrive in never matters: the pick depends only on
// which locales are present, so every surface showing one thing to one reader
// shows the same version, and nothing — app code or database function — orders
// rows for this function.
//
// Two entry points, by what the set can hold. `resolveRequiredTranslation` is
// for a set the database keeps non-empty — a product's translations, which
// `create_product` refuses to write without one and a delete trigger refuses
// to strip to none — so it returns the row and throws on an empty set, which
// only a broken invariant produces. `resolveTranslation` is for a set that can
// genuinely be empty, such as a form for an item not saved yet, and returns
// `null` for it.

import type { SupportedLocale } from "@/lib/constants/locales";
import { compareLocales } from "./locale-order";

export interface LocaleRow {
  locale: string;
}

/**
 * Returns the row to show a reader of `userLocale`, walking the chain
 * (userLocale → en → earliest in locale order), or `null` when `translations`
 * is empty.
 */
export function resolveTranslation<T extends LocaleRow>(
  translations: readonly T[] | null | undefined,
  userLocale: SupportedLocale,
): T | null {
  if (!translations || translations.length === 0) return null;

  // The reader's locale outranks English, which outranks every other locale;
  // among those the app's locale order decides.
  const step = (locale: string) =>
    locale === userLocale ? 0 : locale === "en" ? 1 : 2;
  const before = (a: T, b: T) =>
    step(a.locale) - step(b.locale) || compareLocales(a.locale, b.locale);

  return translations.reduce((best, row) => (before(row, best) < 0 ? row : best));
}

/**
 * `resolveTranslation` over a set the database keeps non-empty: the row to
 * show, never `null`. An empty set is a broken invariant, so it throws rather
 * than hand a caller something to paper over.
 */
export function resolveRequiredTranslation<T extends LocaleRow>(
  translations: readonly T[],
  userLocale: SupportedLocale,
): T {
  const row = resolveTranslation(translations, userLocale);
  if (row === null) {
    throw new Error("A set the database keeps non-empty arrived with no translation");
  }
  return row;
}
