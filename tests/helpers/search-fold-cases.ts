/**
 * What the location search fold has to produce, written down as literals.
 *
 * There is exactly one fold, in Postgres: it folds every searchable string into
 * a stored, indexed column and folds the needle the same way, which is what
 * lets one query rank and cap a search over 35,000 communes. Nothing outside
 * the database folds anything — no surface narrows a set of places in the
 * browser, so no second implementation exists to drift from this one.
 *
 * That is why the expectations are spelled out here as literal input/output
 * pairs rather than computed. An assertion that re-derives the answer from a
 * second implementation of the same rule proves only that two pieces of code
 * agree; a table of literals says what the fold *is*, so quietly swapping the
 * unaccent dictionary or dropping the lowercasing fails rather than being
 * recomputed into agreement.
 *
 * ## What is deliberately not in here
 *
 * **Whitespace.** The fold `btrim`s before folding and nothing stored is padded,
 * so the trimming is unreachable in practice; asserting it would only pin an
 * accident.
 *
 * **Latin letters with no canonical decomposition** — `œ`, `ø`, `æ`, `ł`, `ß`.
 * Postgres's `unaccent` dictionary expands these by rule (`œ`→`oe`, `ø`→`o`,
 * `æ`→`ae`, `ł`→`l`, `ß`→`ss`), and **109 French communes carry one**
 * (Annœullin, Babœuf, Beaumont-Pied-de-Bœuf). They are left out because they
 * pin the *dictionary's* expansion table rather than this fold's own rule, and
 * that table is the one thing here nobody in this repo authors. Every accent
 * that decomposes canonically — Finnish, Swedish and French alike — is below.
 */

export interface SearchFoldCase {
  /** What the case is about, used as the assertion's name. */
  what: string;
  raw: string;
  folded: string;
}

export const SEARCH_FOLD_CASES: SearchFoldCase[] = [
  { what: "a French circumflex", raw: "Nîmes", folded: "nimes" },
  { what: "a French circumflex already lowercased", raw: "nîmes", folded: "nimes" },
  { what: "Finnish umlauts", raw: "Järvenpää", folded: "jarvenpaa" },
  { what: "a Swedish ring above", raw: "Åland", folded: "aland" },
  { what: "a cedilla", raw: "Besançon", folded: "besancon" },
  { what: "an acute and a grave in one name", raw: "Hérault-Où", folded: "herault-ou" },
  { what: "a hyphen and an apostrophe, which are not diacritics", raw: "Côte-d'Or", folded: "cote-d'or" },
  { what: "an all-caps needle", raw: "LILLE", folded: "lille" },
  { what: "a string with nothing to fold", raw: "lille", folded: "lille" },
  { what: "a Swedish alternate name", raw: "Helsingfors", folded: "helsingfors" },
  { what: "a numeric official code", raw: "59512", folded: "59512" },
  { what: "an alphabetic Corsican INSEE code", raw: "2A004", folded: "2a004" },
];
