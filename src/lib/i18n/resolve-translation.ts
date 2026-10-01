// Pick the best translation of a piece of authored content for a reader's
// locale.
//
// Content written per locale is stored as one row per (thing, locale), and an
// author decides which locales to write: not every thing has every locale.
// The fallback order is:
//
//   1. The reader's locale.
//   2. English (en).
//   3. The first row present in the array.
//
// English is special-cased as the second step because it is our most likely
// shared lingua franca; beyond that, "first available" gives a predictable
// answer without a longer hard-coded order — predictable only if the caller
// hands the rows over in a stable order, since embedded rows arrive unordered.
// fi is deliberately not special: it carries no more guarantee than any other
// locale.
//
// Every caller resolves content its own writes guarantee at least one row, in
// any locale — a save with no version is refused, and so is removing the last
// — so the third step always resolves for real data, even for a thing written
// in neither the reader's locale nor English.

import type { SupportedLocale } from "@/lib/constants/locales";

export interface LocaleRow {
  locale: string;
}

/**
 * Returns the row whose locale best matches `userLocale`, walking the
 * fallback chain (userLocale → en → first row). Returns `null` only if
 * `translations` is empty, which the callers' writes never leave (see above),
 * so a `?.` at a call site is purely defensive.
 */
export function resolveTranslation<T extends LocaleRow>(
  translations: readonly T[] | null | undefined,
  userLocale: SupportedLocale,
): T | null {
  if (!translations || translations.length === 0) return null;

  const byLocale = new Map<string, T>();
  for (const t of translations) byLocale.set(t.locale, t);

  return byLocale.get(userLocale) ?? byLocale.get("en") ?? translations[0];
}
