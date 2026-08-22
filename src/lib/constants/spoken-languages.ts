// =============================================================================
// SPOKEN LANGUAGE constants
// =============================================================================
//
// This file owns the **spoken language** vocabulary — the human languages a
// club is delivered in and a person speaks. It backs:
//   - products.spoken_language_code   (a `spoken_language` column)
//   - profiles.spoken_languages       (a `spoken_language[]` column)
//   - the language pickers (settings, gedu registration, the product form)
//   - the shop's Language filter row and its `?lang=` param
//
// **Not the same as the UI locale**, which is which translation of the app
// someone sees and is owned by ./locales.ts. A Finnish-speaking parent may read
// the app in Finnish and want their child placed in an English club. The two
// systems carry a one-way requirement and nothing more — every non-novelty UI
// locale must be offerable as a spoken language, never the reverse — and that
// requirement is a test rather than a shared constant, precisely so neither
// list can quietly start deriving from the other. See the "Locale vs. Spoken
// Language" rule in CLAUDE.md.
//
// **The vocabulary is codegen's, not this file's.** It was a reference table
// read over the wire until 00199 made it a Postgres enum; the values now reach
// TypeScript through `Constants`, so nothing here is hand-maintained and a
// language added by migration appears everywhere the moment types are
// regenerated. Adding one is still a code change as well: the flag map in
// src/components/ui/language-flag.tsx is keyed by the enum and will not compile
// without an entry.
//
// Display names are deliberately absent. A language's name is resolved in the
// *reader's* locale by `useLanguageNames` (src/hooks/), never stored — which is
// what the retired reference table's single English `name` column could never
// do.

import { Constants, type SpokenLanguageCode } from "@/types";

export type { SpokenLanguageCode };

/**
 * Every spoken-language code, in the order the enum declares them — Finland's
 * two national languages first, then the two the platform additionally delivers
 * in. That is the order every picker and every filter row renders, so a parent
 * ticking their languages and an admin choosing a club's read the same list in
 * the same sequence, and no call site sorts.
 */
export const SPOKEN_LANGUAGES: readonly SpokenLanguageCode[] =
  Constants.public.Enums.spoken_language;

/**
 * Whether an arbitrary string is a spoken-language code — the guard a URL param
 * or any other untrusted string is narrowed through, so a hand-edited or stale
 * `?lang=` term resolves to no selection rather than narrowing a grid to
 * nothing.
 *
 * Compared value-by-value rather than by `includes`, so the caller's plain
 * `string` needs no cast to be checked against the generated literal union.
 */
export function isSpokenLanguageCode(
  value: string,
): value is SpokenLanguageCode {
  return SPOKEN_LANGUAGES.some((code) => code === value);
}
