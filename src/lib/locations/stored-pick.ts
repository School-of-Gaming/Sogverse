/**
 * Whether a stored `location_id` should be dropped because it is no longer one
 * of the rows this control is willing to offer.
 *
 * The shapes this exists for are all real: a venue that was deleted, a legacy
 * product pinned above site level, a municipality outside the one country an
 * online municipality club may be funded by, and — the everyday one — a
 * municipality club toggled from online to in-person, which leaves a
 * municipality id in a field that now accepts only venues. The DB trigger
 * permits more than the UI does, so the picker is the gate: it clears a pick
 * outside its own set so the admin re-picks.
 *
 * **Rule: a control that cannot tell "still loading" from "invalid" must not
 * clear anything.** Whatever a control checks against arrives asynchronously,
 * and the whole failure mode this guards is a single frame in which it is not
 * there yet: treat that frame as an answer and editing an existing product
 * silently wipes its venue, with the form then saving the wipe. `undefined`
 * therefore means "no answer yet" and is never an answer — which also covers a
 * read that failed outright, where dropping the value would be worse still.
 *
 * Two functions rather than one, because the two controls know different
 * things. A control holding the *whole* pickable collection asks whether the
 * value is in it; a control holding *one row by id* asks what that row turned
 * out to be. The difference matters at exactly one point, and it is the point
 * this file exists for: for the set, absent means "not fetched"; for the keyed
 * read, a key with no row is a resolved answer — the row is gone — while the
 * *read* not having landed is the absent case. Conflating them either wipes a
 * valid value or keeps a dangling one forever.
 *
 * Separate named functions rather than inline conditions because they are the
 * whole of the decision, and a decision worth a test is worth naming.
 */

import type { LocationType } from "@/types";

/**
 * The set form: the control has fetched every row it would accept.
 *
 * Used where the pickable collection is bounded and read whole — one country's
 * municipalities — so membership of that array *is* the question.
 */
export function shouldDropStoredPick(
  /** The stored id. Nothing stored is nothing to drop. */
  value: string | null | undefined,
  /** Every row the control would accept, or `undefined` until they arrive. */
  pickable: readonly { id: string }[] | undefined,
): boolean {
  if (!value) return false;
  if (pickable === undefined) return false;
  return !pickable.some((row) => row.id === value);
}

/**
 * The keyed form: the control has looked the stored id up on its own.
 *
 * Used where the pickable collection is the whole hierarchy and nobody fetches
 * it — the venue field, which reaches its rows through the tree dialog. There
 * is no set to be in, so the question becomes "what is this row, and is it a
 * level this field accepts".
 *
 * The three answers the caller has to distinguish before calling:
 * `undefined` — the read has not landed; `null` — it landed and there is no
 * such row; a row — it landed and here it is.
 */
export function shouldDropStoredRow(
  /** The stored id. Nothing stored is nothing to drop. */
  value: string | null | undefined,
  /**
   * What the keyed read said about it. `undefined` while in flight, `null` for
   * a resolved "no such row" — a lookup, not an assertion, so a missing key is
   * an answer and not an error.
   */
  row: { id: string; type: LocationType } | null | undefined,
  /** The levels this control accepts. */
  accepted: readonly LocationType[],
): boolean {
  if (!value) return false;
  if (row === undefined) return false;
  // The row is gone — a deleted venue. This is the case a set-membership check
  // could never separate from "not fetched yet", and the reason for this
  // second function.
  if (row === null) return true;
  // A read that answered about some other id has told us nothing about this
  // one, so it falls back to the absent case rather than to a verdict.
  if (row.id !== value) return false;
  return !accepted.includes(row.type);
}
