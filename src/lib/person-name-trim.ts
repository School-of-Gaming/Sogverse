/**
 * Strips from both edges of a typed name every character the profiles CHECKs
 * refuse there.
 *
 * `String.prototype.trim()` covers the ordinary spaces, U+00A0 and U+FEFF, but
 * not the zero-width space U+200B, which a name copied from a web page or a
 * chat app can carry. Left on, the database refuses the name and the person
 * sees a failed save over text that looks right. Every form and contract that
 * writes a first or last name trims through this, before it measures the
 * length.
 */
const EDGE = /^[\s​]+|[\s​]+$/g;

export function trimPersonName(value: string): string {
  return value.replace(EDGE, "");
}
