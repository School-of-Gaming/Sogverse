/**
 * The four colours an identicon is drawn from.
 *
 * An identicon is a person's identity, randomly arranged: the grid and the
 * colour of every cell fall out of the hex bytes of an id, and nothing chooses
 * them. The product does not care which arrangement of these four it gets —
 * only that two people's faces look like two people. So this list means "the
 * colours valid for an identicon" and nothing more, and no call site may reach
 * for one of them because of its hue.
 *
 * ## Numbered, not named
 *
 * A colour here is 1 to 4 and has no hue word, exactly like a pick. The number
 * is a stable id rather than a position: retuning one keeps its id, reordering
 * the list renumbers nothing, and a face derived from an id keeps being the same
 * face. A name would invite a call site to ask for "the white one", which is the
 * first step towards one of these meaning something.
 *
 * ## Why two of them read the brand and two are literal
 *
 * 1 and 2 are Act and World, read from the signature pair, because a face
 * follows the brand: a new visual identity moves them without touching a face.
 * 3 and 4 are `#000000` and `#FFFFFF`, spelled here, because they are the
 * artwork's own — the true black and true white are what make a five-by-five
 * grid read as a pixel face rather than as a coloured square, and neither is the
 * app's ground or the app's ink. Pointing them at a neutral would be a different
 * drawing, not the same drawing in tokens.
 *
 * ## No CSS
 *
 * The theme emits no class for these. Nothing spends one as a class — an
 * identicon is an SVG whose fills are computed per cell — and a token nothing
 * spends is a token that rots. The day a surface needs one as a class, the
 * generator emits them then.
 *
 * ## For the avatar project to inherit
 *
 * SOG-UI will own the whole avatar concept later, and this is what that project
 * inherits: **the black square reads as a hole on a card**, being darker than
 * anything else on the page, and the dark colour of the pair is the weak one on
 * a dark ground either way. Neither is settled here, because settling it means
 * redrawing the avatar rather than renaming a colour.
 */

import { BRAND, type Hex } from "./brand";

/** One identicon colour: its stable id and the colour it is. */
export type IdenticonColour = {
  /** Stable, permanent, and not a position. */
  readonly id: number;
  readonly hex: Hex;
};

/** The four, in the order the palette declares them. */
export const IDENTICON = [
  { id: 1, hex: BRAND.act.hex },
  { id: 2, hex: BRAND.world.hex },
  { id: 3, hex: "#000000" },
  { id: 4, hex: "#FFFFFF" },
] as const satisfies readonly IdenticonColour[];

/**
 * The id of an identicon colour that exists.
 *
 * Derived from the list rather than declared beside it, so the set of ids and
 * the set of colours cannot come apart: a colour added or removed moves this
 * type with it, and an id that is no longer in the list stops compiling wherever
 * it is spelled.
 */
export type IdenticonColourId = (typeof IDENTICON)[number]["id"];
