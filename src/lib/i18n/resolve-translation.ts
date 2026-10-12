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
// Every caller resolves content its own writes guarantee at least one row, in
// any locale — a save with no version is refused, and so is removing the last
// — so the third step always resolves for real data, even for a thing written
// in neither the reader's locale nor English.

import type { SupportedLocale } from "@/lib/constants/locales";
import { compareLocales } from "./locale-order";

export interface LocaleRow {
  locale: string;
}

/**
 * Returns the row to show a reader of `userLocale`, walking the chain
 * (userLocale → en → earliest in locale order). Returns `null` only if
 * `translations` is empty, which the callers' writes never leave (see above),
 * so a `?.` at a call site is purely defensive.
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
