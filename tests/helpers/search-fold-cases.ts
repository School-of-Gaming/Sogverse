/**
 * The inputs the two location search folds have to agree on.
 *
 * There are two folds, deliberately. The database folds every searchable string
 * into a stored, indexed column and folds the needle the same way, because it is
 * the only thing that can rank and cap a search over 35,000 communes. The
 * browser folds again, in TypeScript, for the bounded sets a surface has already
 * fetched in full — filtering a few hundred rows in memory costs no request and
 * has no loading state, and paying a round trip for it would be silly.
 *
 * They agree today. Nothing about having two implementations makes them agree
 * tomorrow, and the failure is silent in the worst way: "Nîmes" keeps matching
 * in one picker and quietly stops in the other, with no error anywhere. So the
 * expectations live here, once, and both suites assert against them — the unit
 * suite against `foldForSearch`, the DB suite against the SQL fold, in CI where
 * a real Postgres exists. A change to either side that is not a change to the
 * other now fails a build.
 *
 * ## What is deliberately not in here
 *
 * **Whitespace.** The SQL side `btrim`s before folding and the TypeScript side
 * does not — its callers trim the query first. Nothing stored is padded, so the
 * difference is unreachable; asserting it would only pin an accident.
 *
 * **Latin letters with no canonical decomposition** — `œ`, `ø`, `æ`, `ł`, `ß`.
 * Postgres's `unaccent` dictionary expands these by rule (`œ`→`oe`, `ø`→`o`,
 * `æ`→`ae`, `ł`→`l`, `ß`→`ss`); NFD normalization has nothing to decompose, so
 * the TypeScript fold leaves them alone. That *is* a real divergence, and it is
 * out of reach rather than fixed — but for a narrower reason than "no place is
 * spelled that way", which is false: **109 French communes carry one** (Annœullin,
 * Babœuf, Beaumont-Pied-de-Bœuf). What puts it out of reach is *which rows reach
 * the TypeScript fold at all* — only admin-created venue names and Finland's
 * municipalities, none of which is spelled with one. France's communes are
 * searched exclusively in Postgres, which folds them correctly.
 *
 * So this is a tripwire, not a settled question: **the day a set-scope picker
 * holds French communes, the divergence goes live** and `foldForSearch` needs
 * explicit replacements before it does. Anything folded identically on both
 * sides — every accent in Finnish, Swedish and French — is below.
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
