// Pick the best translation for a user's locale.
//
// The only content this resolves is product_translations (one row per
// (product_id, locale)). Admins decide which locales to provide; not every
// product has every locale. The fallback order is:
//
//   1. The user's current UI locale.
//   2. English (en).
//   3. The first row present in the array.
//
// Every product is guaranteed to have ≥1 translation in **any** locale by a
// non-empty check in the create/update RPC and a BEFORE-DELETE trigger
// (migration 00047 relaxed this from the old "≥1 of en/fi" rule to "≥1 of
// any"). So the array is never empty for products and the "first available"
// step always resolves — even for a product that has neither the user's
// locale nor en (e.g. an sv-only product).
//
// English is special-cased as the second step because it's our most-likely
// shared lingua franca; beyond that, "first available" gives a predictable
// answer without a longer hard-coded order. fi is deliberately NOT special:
// under the relaxed rule it carries no more guarantee than any other locale.

import type { SupportedLocale } from "@/lib/constants/locales";

export interface LocaleRow {
  locale: string;
}

/**
 * Returns the row whose locale best matches `userLocale`, walking the
 * fallback chain (userLocale → en → first row). Returns `null` only if
 * `translations` is empty — which never happens for products (DB-guaranteed
 * ≥1 row), so the `?.` at product call sites is purely defensive.
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
