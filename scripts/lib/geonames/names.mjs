/**
 * Resolving one name, in one language, out of GeoNames' alternates.
 *
 * The same mechanical rule serves three jobs — a row's canonical name under
 * `nameResolution: { language }`, every `name_i18n` alternate, and a country
 * row's native name — because a second rule for any of them would be curation
 * by another name, and curation is what this whole system exists to stop
 * owning.
 *
 * ## The rule
 *
 *   1. Candidates are the row's alternates in that language, **excluding
 *      colloquial and historic ones**. A historic alternate is a pre-merger
 *      name lingering on a renamed row and is exactly what would make a
 *      language resolution rename places backwards.
 *   2. If any candidate is preferred-flagged, only those remain. GeoNames'
 *      preferred flag is the closest thing upstream has to "this is the name",
 *      and it is what makes "Sverige" win over "Konungariket Sverige".
 *   3. Of what remains, the **shortest** wins — the tiebreak that picks the
 *      plain name over the ceremonial one when nothing is flagged.
 *   4. If nothing remains, there is no name in that language. The caller
 *      decides what that means: a canonical resolution falls back to the dump
 *      name, an alternate simply is not stored.
 *
 * Step 3 is a *sort*, not a scan, and it carries two further tiebreaks — code
 * unit order, then alternate id — because two candidates of equal length would
 * otherwise resolve by whatever order the dump happened to list them in, and a
 * generator whose output depends on file order is not deterministic. Code-unit
 * order rather than a collator for the same reason the France generator sorts
 * that way: `Intl.Collator` moves with the ICU version bundled in Node.
 */

/**
 * The chosen name in `language`, or null if the row has none there.
 *
 * @param {Map<string, object[]> | undefined} byLanguage the row's alternates
 * @param {string} language
 */
export function resolveAlternate(byLanguage, language) {
  const all = byLanguage?.get(language) ?? [];
  const candidates = all.filter((entry) => !entry.colloquial && !entry.historic);
  if (candidates.length === 0) return null;

  const preferred = candidates.filter((entry) => entry.preferred);
  const pool = preferred.length > 0 ? preferred : candidates;

  const sorted = [...pool].sort(
    (a, b) =>
      a.name.length - b.name.length ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
      a.alternateNameId - b.alternateNameId,
  );
  return sorted[0].name;
}

/**
 * A row's canonical name under the country's `nameResolution`. `"dump"` takes
 * the dump's own `name` column; a language resolution falls back to it, which
 * is what makes a language rule safe to declare for a country whose alternates
 * are patchy — a row with no alternate keeps the name it had rather than losing
 * one.
 */
export function resolveCanonicalName(row, byLanguage, nameResolution) {
  if (nameResolution === "dump") return row.name;
  return resolveAlternate(byLanguage, nameResolution.language) ?? row.name;
}

/**
 * The `name_i18n` map for a row: every configured locale that resolves to
 * something *other* than the canonical name.
 *
 * **The never-duplicate rule is mechanical here.** `name` holds the canonical
 * name and `name_i18n` holds only the rows that differ, so a locale resolving
 * to the same string contributes nothing — the display resolver already falls
 * back to `name` for it. Storing it anyway would put one name in two places and
 * make the fallback a lie.
 */
export function resolveNameI18n(canonicalName, byLanguage, locales) {
  const entries = {};
  for (const locale of locales) {
    const value = resolveAlternate(byLanguage, locale);
    if (value !== null && value !== canonicalName) entries[locale] = value;
  }
  return entries;
}
