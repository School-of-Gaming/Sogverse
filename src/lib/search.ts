export function escapeLikePattern(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

/**
 * Split what someone typed into the terms every match has to satisfy.
 *
 * Someone searching types the name they know — "Anna Virtanen" — and no single
 * field holds it: the two words are a first name and a surname, so matching the
 * whole string against a field finds nobody even though either word alone finds
 * them. Each word is matched separately instead and a person has to match all
 * of them, which is also what makes adding the surname *narrow* the results
 * rather than change what is being asked.
 *
 * Terms are cut on whitespace, on commas — how a name gets typed surname-first
 * — and on `*`, which PostgREST reads as a wildcard for `ilike` before the
 * pattern ever reaches SQL, so a stray one would match everybody rather than
 * nobody. None of the three means anything inside a name, an email or a handle.
 *
 * **There is one implementation of a match, and it is in the database.** This
 * function is its front half: it decides what counts as a term, and each term
 * becomes one `ILIKE` the database ANDs with the rest. A browser-side companion
 * lived beside it while a picker matched a list it already held, and the two
 * agreed only by habit — which is how that picker once became unable to find a
 * surname the users list could. Every people surface asks the shared read now,
 * so nothing outside the database decides whether somebody matches.
 */
export function searchTerms(query: string): string[] {
  return query.split(/[\s,*]+/).filter(Boolean);
}
