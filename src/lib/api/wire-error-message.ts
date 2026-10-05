/**
 * The message off the wire, or `null` for anything that is not one.
 *
 * Postgres refusing or failing produces an error carrying a `code` and a
 * `message` written to be read, and splicing that into a page's failure band
 * tells the reader something they can act on. A schema mismatch does not: a
 * `ZodError`'s message is a JSON dump of every issue, which would render as a
 * wall of brackets. So the reason is taken only from the wire-shaped error, and
 * everything else — a parse failure, a network fault, a bug — falls to the
 * generic sentence.
 */
export function wireErrorMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if (!("code" in error) || !("message" in error)) return null;
  const { code, message } = error;
  if (typeof code !== "string" || typeof message !== "string") return null;
  return message.length > 0 ? message : null;
}
