// The palette as a hex, for the renderers that cannot read a CSS variable:
// email clients, the identicon, the satori-drawn Open Graph cards.
//
// It no longer mirrors globals.css by hand, and it no longer spells a colour of
// its own: every value below is derived from `@sog/ui`, which is the one place a
// School of Gaming colour is authored, so a hue moves in the package and this
// module follows without an edit. No value below is spelled here any more, and a
// hex typed into one would be a colour Sogverse had defined for itself.
//
// Nothing in this file is typed by conversion or by eye, and nothing in it is
// composited any more either: a flattened tint is the brand colour at an alpha
// step in a solid's clothes, which is a colour we do not have.

import { BRAND as SOG_BRAND, NEUTRALS, STATUS_INK, statusHex } from "@sog/ui";

/**
 * The brand fills and the foreground each one carries.
 *
 * The two are always named together because they are not independent choices:
 * act is a light colour and only a dark label reads on it (#121212 at 9.6:1;
 * white is 2.0:1), world is a dark colour and only a light label
 * reads on it (#ffffff at 6.4:1; the dark label is 2.9:1). They are mirror
 * images, so a button that swaps its fill and keeps its label has not changed
 * colour, it has broken. That pairing is the library's own — a fill and its
 * foreground are one entry there — so an email's label comes from the same
 * decision the app's button renders, rather than from a value that matches today.
 */
export const BRAND = {
  act: SOG_BRAND.act.hex,
  actForeground: SOG_BRAND.act.foreground,
  world: SOG_BRAND.world.hex,
  worldForeground: SOG_BRAND.world.foreground,
} as const;

/** The grounds, the ink on them, and the greys between. */
export const DARK_THEME = {
  bg: NEUTRALS.background.hex,
  card: NEUTRALS.card.hex,
  foreground: NEUTRALS.foreground.hex,
  border: NEUTRALS.border.hex,
  mutedFg: NEUTRALS.mutedForeground.hex,
} as const;

// The hero gradient's two glows used to live here: act at 20% and world at 10%,
// pre-composited over the dark ground because neither a satori render nor an
// email client can be relied on for alpha. Flattening is what made them
// indefensible — a composited value is the brand colour at an alpha step
// wearing a solid's clothes, and a brand colour exists at its authored value or
// not at all. The two heroes, both social cards and the mail's header now sit
// on the ground and mark themselves with a world rule at full value, so
// nothing in Sogverse composites and there is no caller left for these.

// The four Yty-Element colours used to be mirrored here for the renderers that
// cannot read a CSS variable. None of them draws one today — the mail, the
// identicon and the OG cards all spend brand and neutral values only — and a
// mirror with no consumer is a value nobody can check, so it is gone. A
// renderer that needs a family reads `YTY_FAMILIES` from the library directly,
// which is where the colour is authored.

/**
 * The status fills, and the foreground each carries.
 *
 * Derived, not spelled: the four status colours are the library's now, and
 * `info` resolves through Wit — a status is a fact and a fact takes a family —
 * so a retune of Wit moves this mail's callout with it.
 *
 * Only `info` is here, because only `info` has been needed. Mirroring a colour
 * no mail uses would put an unmeasured value in the palette and read as an
 * invitation to reach for it; add `destructive`/`success`/`warning` when a mail
 * actually needs one.
 *
 * The foreground is named beside the fill because a fill and its foreground are
 * one decision, and under the library that decision is **ink**: every status
 * fill is light enough to take a dark label and none of them is dark enough to
 * take a white one, so the white this pair used to carry is gone from the
 * palette entirely. `palette-contrast.test.ts` keeps white-on-info pinned as a
 * rejected pairing so the reason survives the value that used to force it.
 */
export const STATUS = {
  info: statusHex("info"),
  infoForeground: STATUS_INK,
} as const;

// The mail's note panel used to carry a composited pair here — the info colour
// at a tenth for its wash and at a half for its edge, flattened against the
// message panel because a mail client cannot be relied on for alpha. No status
// colour is tinted anywhere now: the panel wears the neutral border every other
// panel wears and sits on the ground it is already on, so both values have no
// consumer and are gone.

// A footer grey of #555555 used to live here. It mirrored no token in
// globals.css — the only value in this module that did not — and it was 2.51:1
// on the background, below AA and below AA-large, which is worse than the purple
// body text this codebase rejects outright as unreadable. Small, grey and legal
// are three different things. Footers use mutedFg (7.70:1) like every other
// secondary text in the product.
