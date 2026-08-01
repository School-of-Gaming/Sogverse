/**
 * Client-side search folding, for the two location lists that are small enough
 * to filter in memory.
 *
 * This is deliberately *not* the general search path. Anything that has to
 * search places at large — every commune of a country, every country at once —
 * is answered by the database, which folds the same way over an index. What is
 * left here are the bounded sets a surface has already fetched in full: the
 * venues that exist, and one country's municipalities. Filtering those in the
 * browser is one pass over a few hundred strings and costs a round trip to do
 * any other way.
 *
 * **Rule: the two folds have to agree.** A user who types "jarvenpaa" must get
 * Järvenpää from either path, so this strips exactly what the database's fold
 * strips — diacritics and case, nothing else.
 */

/**
 * Fold a string for matching: strip diacritics and case, so "nimes" finds Nîmes
 * and "jarvenpaa" finds Järvenpää — and so does the accented spelling, since
 * both sides go through this. Decomposing first (NFD) turns "î" into "i" plus a
 * combining circumflex, and the combining marks are then dropped by range
 * rather than by `\p{Diacritic}`, which needs a newer regex target than this
 * project compiles to.
 */
export function foldForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
