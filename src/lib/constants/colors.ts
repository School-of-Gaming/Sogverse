// The palette as a hex, for the renderers that cannot read a CSS variable:
// email clients, the identicon, the satori-drawn Open Graph cards.
//
// It no longer mirrors globals.css by hand, and it no longer spells a colour of
// its own: every value below is derived from `@sog/ui`, which is the one place a
// School of Gaming colour is authored, so a hue moves in the package and this
// module follows without an edit. No value below is spelled here any more, and a
// hex typed into one would be a colour Sogverse had defined for itself.
//
// Nothing in this file is typed by conversion or by eye: a composited tint is
// computed by `composite()` from the colour, its alpha and the ground it sits
// on, because a tint hand-blended once is a value nobody can re-derive.

import {
  BRAND as SOG_BRAND,
  NEUTRALS,
  STATUS_INK,
  YTY_FAMILIES,
  composite,
  statusHex,
} from "@sog/ui";

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

/**
 * The hero gradient's two glows, pre-composited over the dark ground.
 *
 * A mail client cannot be relied on for alpha, so the app's translucent wash is
 * flattened against the ground it actually sits on — the shell's background,
 * which is what the gradient is painted over.
 */
export const GRADIENT = {
  actGlow: composite(BRAND.act, 0.2, DARK_THEME.bg),
  worldGlow: composite(BRAND.world, 0.1, DARK_THEME.bg),
} as const;

/**
 * The four Yty-Element colours.
 *
 * One value per family, which is the library's own shape: the same colour fills,
 * edges, rings, marks and inks a label, so a renderer that cannot read a CSS
 * variable has nothing to choose between. Where one of these is set as type it
 * is on a **label** — an element's name beside its mark — and never on a
 * sentence.
 */
export const YTY_ELEMENT = {
  harmony: YTY_FAMILIES.harmony.hex,
  glow: YTY_FAMILIES.glow.hex,
  valor: YTY_FAMILIES.valor.hex,
  wit: YTY_FAMILIES.wit.hex,
} as const;

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

/**
 * The mail's own note panel, pre-composited for email.
 *
 * A mail client cannot be relied on for alpha, so the wash and its edge are
 * flattened against the ground they actually sit on — the message panel, not the
 * shell's darker background behind it. Composite over the wrong ground and the
 * tint is a visible rectangle rather than a wash.
 *
 * **The tint itself is ruled against and has not yet been removed.** No status
 * colour is to be tinted anywhere — for `info` it is forced, because info is
 * Wit's blue and a brand colour exists at its authored value or not at all — and
 * the app's `Alert` and this panel are the same construct with one renderer's
 * worth of difference between them. They are reworked together in the construct
 * pass, not separately here, or they stop being the same construct.
 */
export const STATUS_TINT = {
  infoBorder: composite(STATUS.info, 0.5, DARK_THEME.card),
  infoSurface: composite(STATUS.info, 0.1, DARK_THEME.card),
} as const;

// A footer grey of #555555 used to live here. It mirrored no token in
// globals.css — the only value in this module that did not — and it was 2.51:1
// on the background, below AA and below AA-large, which is worse than the purple
// body text this codebase rejects outright as unreadable. Small, grey and legal
// are three different things. Footers use mutedFg (7.70:1) like every other
// secondary text in the product.
