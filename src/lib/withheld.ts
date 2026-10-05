/**
 * A value that exists but was not sent to this reader.
 *
 * Some documents a page renders are redacted twins of a fuller one: the same
 * shape, with the private fields left off the wire entirely. A redacted field
 * is not the same thing as an empty one — "nobody has written a note" and
 * "there is a note, and it is not yours to read" draw differently — so it
 * cannot be spelled `null`, and it must not be spelled as a made-up string
 * either.
 *
 * A field that can be withheld is typed `T | Withheld`, which puts the case in
 * front of every consumer at compile time: a renderer cannot read the text of a
 * withheld note by accident, because there is no text in the type to read.
 *
 * A plain object rather than a symbol, so a value holding it survives being
 * handed from a server component to a client one.
 */
export interface Withheld {
  readonly withheld: true;
}

export const WITHHELD: Withheld = Object.freeze({ withheld: true as const });

export function isWithheld(value: unknown): value is Withheld {
  return (
    typeof value === "object" &&
    value !== null &&
    "withheld" in value &&
    (value as { withheld: unknown }).withheld === true
  );
}
