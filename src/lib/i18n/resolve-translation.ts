// Pick the best translation for a user's locale.
//
// The translation tables (product_translations_v2, topic_translations_v2,
// tag_translations_v2) hold one row per (parent_id, locale). Admins decide
// which locales to provide; not every parent has every locale. This helper
// walks the fallback order:
//
//   1. The user's current UI locale.
//   2. English (en).
//   3. Finnish (fi).
//   4. The first locale present in the array.
//
// Every product is guaranteed to have at least one of (en, fi) by an
// RPC-level check on insert and a BEFORE-DELETE trigger — so for products
// the array is never empty. For topics/tags, inline-create only writes the
// admin's current locale, so absence in fi is possible until someone fills
// it in via the (yet-to-be-built) reference-data translation manager.

import type { SupportedLocale } from "@/lib/constants/locales";

export interface LocaleRow {
  locale: string;
}

/**
 * Returns the row whose locale best matches `userLocale`, walking the
 * fallback chain. Returns `null` only if `translations` is empty.
 */
export function resolveTranslation<T extends LocaleRow>(
  translations: readonly T[] | null | undefined,
  userLocale: SupportedLocale,
): T | null {
  if (!translations || translations.length === 0) return null;

  const byLocale = new Map<string, T>();
  for (const t of translations) byLocale.set(t.locale, t);

  return (
    byLocale.get(userLocale) ??
    byLocale.get("en") ??
    byLocale.get("fi") ??
    translations[0]
  );
}
