/**
 * How a template turns the admin testing form's strings into values.
 *
 * **Every field the form posts is a string**, because that is what an HTML form
 * posts — so the layer that knows what a blank one means is the template's own
 * resolver, and these are the pieces those resolvers are built from. They live
 * in one module rather than one per template for the reason the messages
 * themselves state: the sentence an admin reads when a date will not parse
 * should be the same sentence whichever form they typed it into.
 *
 * **The messages are written to be read by the person who typed the field.**
 * The testing page shows a thrown message verbatim and the send route answers
 * with it, so each one names the field and says what it wanted.
 */

/**
 * A boolean, as a form posts one.
 *
 * A select rather than a checkbox because every field the testing form has is a
 * string, and the tuple's *order* is the default — an untouched select posts
 * its first option, so a field that should default to "no" reverses it.
 */
export const FORM_YES_NO = ["yes", "no"] as const;

export function fail(field: string, wanted: string, got: string): never {
  throw new Error(`${field}: expected ${wanted}, got "${got}".`);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function requireDate(value: string, field: string): string {
  const trimmed = value.trim();
  if (!DATE_PATTERN.test(trimmed)) fail(field, "a date as YYYY-MM-DD", value);
  const [year, month, day] = trimmed.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // A real calendar date, not merely a well-shaped one: `2026-02-31` matches the
  // pattern and rolls over to March, which would move an occurrence silently.
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    fail(field, "a real calendar date", value);
  }
  return trimmed;
}

/** A blank field is an absence; anything else has to be a real calendar date. */
export function optionalDate(value: string, field: string): string | null {
  return value.trim() === "" ? null : requireDate(value, field);
}

export function requireTime(value: string, field: string): string {
  const trimmed = value.trim();
  if (!TIME_PATTERN.test(trimmed)) fail(field, "a 24-hour clock time as HH:MM", value);
  return trimmed;
}

export function requireWholeNumber(value: string, field: string, minimum: number): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) fail(field, "a whole number", value);
  const parsed = Number(trimmed);
  if (parsed < minimum) fail(field, `a whole number of at least ${minimum}`, value);
  return parsed;
}

/** A blank field is an absence; anything else has to be a whole number. */
export function optionalWholeNumber(
  value: string,
  field: string,
  minimum: number,
): number | null {
  return value.trim() === "" ? null : requireWholeNumber(value, field, minimum);
}

/** A blank field is an absence; anything else has to be a URL a client can follow. */
export function optionalUrl(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return fail(field, "an absolute URL", value);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail(field, "an http or https URL", value);
  }
  return trimmed;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireEmail(value: string, field: string): string {
  const trimmed = value.trim();
  if (!EMAIL_PATTERN.test(trimmed)) fail(field, "an email address", value);
  return trimmed;
}

/** A textarea's non-blank lines, trimmed. */
export function textareaLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** `0` = Monday … `6` = Sunday, as the schedule and RFC 5545 both order them. */
const WEEKDAY_TOKENS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** A weekday token from a typed schedule line, as the app's own index. */
export function requireWeekday(value: string, field: string): number {
  const index = WEEKDAY_TOKENS.indexOf(value.trim().toLowerCase());
  if (index === -1) fail(field, `one of ${WEEKDAY_TOKENS.join(", ")}`, value);
  return index;
}
