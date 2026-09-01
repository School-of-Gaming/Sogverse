/**
 * Whether a stored `location_id` should be dropped because it is no longer a
 * row this control is willing to offer.
 *
 * The shapes this exists for are all real: a site that was deleted, a legacy
 * product pinned above site level, a municipality outside the one country an
 * online municipality club may be funded by, and — the everyday one — a
 * municipality club toggled from online to in-person, which leaves a
 * municipality id in a field that now accepts only sites. The DB trigger
 * permits more than the UI does, so the picker is the gate: it clears a pick it
 * would never itself have offered, and the admin re-picks.
 *
 * **Rule: a control that cannot tell "still loading" from "invalid" must not
 * clear anything.** Whatever a control checks against arrives asynchronously,
 * and the whole failure mode this guards is a single frame in which it is not
 * there yet: treat that frame as an answer and editing an existing product
 * silently wipes its location, with the next save writing the loss. `undefined`
 * therefore means "no answer yet" and is never an answer — which also covers a
 * read that failed outright, where dropping the value would be worse still.
 *
 * **One function, because every control that picks a place now asks the same
 * question.** They all reach their rows through the tree dialog, which browses
 * the whole hierarchy and fetches no collection to test membership of — so the
 * question is never "is this id in the set I hold" but "what did this id turn
 * out to be", asked of a keyed read. The difference between the two is not
 * cosmetic, and it lands squarely on `null`: for a keyed read a key with **no
 * row** is a *resolved* answer — the row is gone — while for a set the same
 * absence is indistinguishable from "not fetched". A set-shaped guard would
 * therefore keep a dangling id forever, and a keyed-shaped one reading a set
 * would wipe a valid pick. The set-shaped guard that used to live here went
 * with the last set-shaped picker, rather than being left behind to be reached
 * for by accident.
 *
 * A named function rather than a condition inline in an effect, because it is
 * the whole of the decision, and a decision worth a test is worth naming.
 */

import type { LocationType } from "@/types";

/**
 * What a control will accept back from its own keyed read.
 *
 * `types` is a shape constraint — which levels of the hierarchy this field may
 * point at. `countryCode` is a *business* one, and both fields use it: the
 * municipality field always, because an online municipality club is funded by a
 * Finnish kunta and by nothing else; the site field whenever the product type
 * declares a `countryBound`, because an in-person municipality club runs at a
 * Finnish site for exactly the same reason. Neither constraint is about the
 * row's shape — a French commune is a perfectly well-formed municipality and a
 * French school a perfectly well-formed site; the funding rule refuses both —
 * which is
 * why this rides as an optional country beside the accepted levels rather than
 * as a second function. Omitting it accepts those levels in every country,
 * which is what an unbound product type's site field wants.
 */
export interface AcceptedLocation {
  /** The levels this control accepts. */
  types: readonly LocationType[];
  /** ISO 3166-1 alpha-2. Omitted means "any country". */
  countryCode?: string;
}

/**
 * The keyed form, and the only form: the control has looked the stored id up on
 * its own rather than fetching a collection to test membership of.
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
  row:
    | { id: string; type: LocationType; country_code: string | null }
    | null
    | undefined,
  accepted: AcceptedLocation,
): boolean {
  if (!value) return false;
  if (row === undefined) return false;
  // The row is gone — a deleted site. This is the case a set-membership check
  // could never separate from "not fetched yet".
  if (row === null) return true;
  // A read that answered about some other id has told us nothing about this
  // one, so it falls back to the absent case rather than to a verdict.
  if (row.id !== value) return false;
  if (!accepted.types.includes(row.type)) return true;
  // A row at the right level in the wrong country. Both fields ask it whenever
  // a bound applies — always for the municipality field, and for the site
  // field on a country-bound product type — and it is the case the seeded
  // browse path and the country-scoped search exist to stop anyone reaching in
  // the first place. This catches what the other two cannot: a row stored
  // before either of them existed, and a row that was in the right country
  // until the product's type changed under it.
  return (
    accepted.countryCode !== undefined &&
    row.country_code !== accepted.countryCode
  );
}
