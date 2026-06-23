import type { Json } from "@/types";

/**
 * Resolve a location's display name for a viewer locale.
 *
 * `name` is the canonical native-language name (Finnish for FI rows, English for
 * UK/US, ...). `name_i18n` is a `locale -> name` jsonb map holding overrides only
 * for the rows that differ — e.g. `{ "sv": "Helsingfors" }`. We resolve
 * `name_i18n[locale] ?? name`, so every untranslated row, every admin-created
 * site, and every viewer whose locale has no override (fi/en/tlh on FI rows)
 * simply gets `name`. The base `name` is never duplicated into `name_i18n`.
 *
 * Accepts the structural subset both `Location` and the joined browse-row
 * location shape satisfy, so card/tree/breadcrumb call sites can all use it.
 */
export function localizedLocationName(
  loc: { name: string; name_i18n: Json | null },
  locale: string,
): string {
  const i18n = loc.name_i18n;
  if (i18n && typeof i18n === "object" && !Array.isArray(i18n)) {
    const value = i18n[locale];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return loc.name;
}

/**
 * Every alternate-locale name string on a row (the `name_i18n` values), for
 * search indexing — so a Swedish speaker typing "Helsingfors" finds Helsinki
 * regardless of their UI locale. Excludes the canonical `name`; callers that
 * want both index `name` separately.
 */
export function localizedNameAlternates(loc: { name_i18n: Json | null }): string[] {
  const i18n = loc.name_i18n;
  if (i18n && typeof i18n === "object" && !Array.isArray(i18n)) {
    return Object.values(i18n).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
  }
  return [];
}
