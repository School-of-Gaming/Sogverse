/**
 * The sixteen colours a person may pick for themselves.
 *
 * A Gedu, a parent or a gamer choosing the colour of their own thing, the way a
 * player picks a shirt. A pick carries no meaning beyond *this is mine*: it is
 * not a family, not a status, not a categorical palette, and not a brand
 * colour. It says who chose it and nothing else.
 *
 * **The product never spends one on its own behalf.** Never in chrome, never
 * for a status, never for a product kind, never as a default the app assigns by
 * meaning. The only way a pick reaches the screen is a person choosing it, or a
 * person's identity deriving it. Everything the product says in colour is said
 * with the signature pair, the families and the neutrals, which are the tokens
 * that mean something; a pick means only that somebody liked it.
 *
 * The custom voice zone is the first consumer — a moderator picking the colour
 * of a zone they made. That is a use of this list, not a definition of it: a
 * later surface letting a gamer colour their own profile draws from the same
 * sixteen and needs no new palette.
 *
 * ## Why these sixteen
 *
 * They are designed to be told apart from each other at a glance, because the
 * whole job of the set is that two people's picks look like two picks. They are
 * saturated enough to sit on the dark ground without dulling, and tuned so that
 * none of them clashes with the theme around it. And they are a complete
 * rainbow with no gap a child would notice — a picker missing a stretch of the
 * spectrum reads as broken to the person who wanted the colour that is not
 * there.
 *
 * Steering them away from the brand's own hues was tried first, and it produced
 * a palette with holes: it felt less connected to the brand rather than more,
 * because the gaps were exactly where the brand's colours live. So the rainbow
 * is complete, and two of the picks sitting near the signature pair is
 * deliberate. Nothing is confused by it — a pick is never spoken by the
 * product, so a pick that resembles act is still unmistakably somebody's
 * choice rather than a call to action.
 *
 * ## Numbered, not named
 *
 * A pick is `pick-1` to `pick-16`, and it has no hue word. A consumer may have
 * no opinion at all about which hue a pick is: it is always presented as a
 * list, any pick can be replaced by any other, or it is not a real pick. A name
 * would invite a call site to reach for "the green one", which is the first step
 * back towards a colour that means something.
 *
 * **The number is a stable id, not a position.** Retuning pick 7's hue keeps it
 * pick 7, so a person's stored choice survives the retune. Reordering the
 * picker never renumbers anything. If the palette ever shrinks, the missing ids
 * stay missing rather than closing up. The list below is the picker's order and
 * every entry carries its own id, so a consumer iterating the list and a
 * consumer resolving a stored id are reading the same thing.
 *
 * *Open: each pick's companion — what ink or glyph reads on it — is measured
 * with the Yty element recipe rather than ahead of it, so no pick carries an
 * `on` yet and none is in the contrast ledger's grounds.*
 */

import type { Hex } from "./brand";

/** One pick: its stable id and the colour it is. */
export type Pick = {
  /** Stable, permanent, and not a position. */
  readonly id: number;
  readonly hex: Hex;
};

/** The sixteen, in the order the picker draws them. */
export const PICKS = [
  { id: 1, hex: "#F4504E" },
  { id: 2, hex: "#FB8B3C" },
  { id: 3, hex: "#F7A31F" },
  { id: 4, hex: "#E8C21F" },
  { id: 5, hex: "#9FC92E" },
  { id: 6, hex: "#46CF5A" },
  { id: 7, hex: "#18CF86" },
  { id: 8, hex: "#1CCCBE" },
  { id: 9, hex: "#25CFEE" },
  { id: 10, hex: "#38B0F7" },
  { id: 11, hex: "#5B86F0" },
  { id: 12, hex: "#7A72F5" },
  { id: 13, hex: "#A36BF6" },
  { id: 14, hex: "#C45FF2" },
  { id: 15, hex: "#E85FE0" },
  { id: 16, hex: "#F767A8" },
] as const satisfies readonly Pick[];

/**
 * The id of a pick that exists.
 *
 * Derived from the list rather than declared beside it, so the set of ids and
 * the set of colours cannot come apart: a pick added or removed moves this type
 * with it, and a stored id that is no longer in the list stops compiling
 * wherever it is spelled.
 */
export type PickId = (typeof PICKS)[number]["id"];
