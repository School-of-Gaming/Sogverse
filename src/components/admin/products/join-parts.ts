/**
 * The separator between two short facts sharing one line — "3 waiting · 1
 * unplaced".
 *
 * A module constant rather than a literal at the call site, and for two reasons
 * at once. It is the same middle dot the schedule lines and the shop's own fact
 * rows use, so a second spelling of it would show up as two different-looking
 * lines on the same page; and the lint rule that bans literal strings in a
 * component cannot tell a separator from untranslated copy, which is the right
 * default — the way past it is to state that this is punctuation, once, here.
 */
const PART_SEPARATOR = " · ";

/**
 * Join the parts of a compound fact, dropping the ones that have nothing to say.
 *
 * `null` is how a caller says "this count is zero and the phrase for it should
 * not appear at all" — a "0 waiting" beside a real number reads as a second
 * fact rather than as the absence of one.
 */
export function joinParts(parts: readonly (string | null)[]): string {
  return parts.filter((part) => part !== null).join(PART_SEPARATOR);
}
