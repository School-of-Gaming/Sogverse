/**
 * Whether a stored `location_id` should be dropped because it is no longer one
 * of the rows this control is willing to offer.
 *
 * The two shapes it exists for are both real: a venue that was deleted, and a
 * legacy product pinned above site level or at a municipality outside the one
 * country an online municipality club may be funded by. The DB trigger permits
 * more than the UI does, so the picker is the gate — it offers only the valid
 * set, and clears a pick outside it so the admin re-picks.
 *
 * **Rule: a control that cannot tell "still loading" from "invalid" must not
 * clear anything.** The pickable set arrives asynchronously, and the whole
 * failure mode this guards is a single frame in which the set is not there yet:
 * treat that frame as "not in the set" and editing an existing product silently
 * wipes its venue, with the form then saving the wipe. `undefined` therefore
 * means "no answer yet" and is never an answer — which also covers a read that
 * failed outright, where dropping the value would be worse still. Only a set
 * that has actually arrived, and actually does not contain the value, is
 * grounds to drop it.
 *
 * A separate function rather than an inline condition because it is the whole
 * of the decision, and a decision worth a test is worth naming.
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
