// The palette as a hex, for the renderers that cannot read a CSS variable:
// email clients, the identicon, the satori-drawn Open Graph cards.
//
// It no longer mirrors globals.css by hand. Every value the brand owns is
// derived here from `@sog/ui`, which is the one place a School of Gaming colour
// is authored, so a hue moves in the package and this module follows without an
// edit. Anything still spelled as a literal below is a colour the library does
// not own yet — the status colours — and it is spelled once, here, until the
// ruling that moves it into the package.
//
// Nothing in this file is typed by conversion or by eye: a composited tint is
// computed by `composite()` from the colour, its alpha and the ground it sits
// on, because a tint hand-blended once is a value nobody can re-derive.

import { BRAND as SOG_BRAND, NEUTRALS, YTY_FAMILIES, composite } from "@sog/ui";

/**
 * The brand fills and the foreground each one carries.
 *
 * The two are always named together because they are not independent choices:
 * the primary is a light colour and only a dark label reads on it (#121212 at
 * 9.6:1; white is 2.0:1), the secondary is a dark colour and only a light label
 * reads on it (#ffffff at 6.4:1; the dark label is 2.9:1). They are mirror
 * images, so a button that swaps its fill and keeps its label has not changed
 * colour, it has broken. That pairing is the library's own — a fill and its
 * foreground are one entry there — so an email's label comes from the same
 * decision the app's button renders, rather than from a value that matches today.
 */
export const BRAND = {
  primary: SOG_BRAND.primary.hex,
  primaryForeground: SOG_BRAND.primary.foreground,
  secondary: SOG_BRAND.secondary.hex,
  secondaryForeground: SOG_BRAND.secondary.foreground,
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
  primaryGlow: composite(BRAND.primary, 0.2, DARK_THEME.bg),
  secondaryGlow: composite(BRAND.secondary, 0.1, DARK_THEME.bg),
} as const;

/**
 * The four Yty-Element colours.
 *
 * Taken at each family's **soft** variant, which is the library's rule for the
 * job these do: strong fills, borders, rings and glows; soft carries text and
 * glyphs, and a mail spends an element colour as ink beside a name.
 */
export const YTY_ELEMENT = {
  harmony: YTY_FAMILIES.harmony.soft,
  glow: YTY_FAMILIES.glow.soft,
  valor: YTY_FAMILIES.valor.soft,
  wit: YTY_FAMILIES.wit.soft,
} as const;

/**
 * The status fills, and the foreground each carries.
 *
 * Literal, and the only literal left in this module: the status colours are the
 * one part of the palette `@sog/ui` does not own yet, so they are spelled here
 * until the ruling that moves them in. The values match `--color-info` and
 * `--color-info-foreground` in globals.css, which is the pairing this replaces
 * one day rather than a second source of truth to keep in step forever.
 *
 * Only `info` is here, because only `info` has been needed. Mirroring a colour
 * no mail uses would put an unmeasured value in the palette and read as an
 * invitation to reach for it; add `destructive`/`success`/`warning` when a mail
 * actually needs one, and measure it in the same change.
 *
 * The foreground is named beside the fill because a fill and its foreground are
 * one decision — but this particular pair is **not a legible one at body size**:
 * white on this blue is 3.48:1, under the 4.5:1 floor. So `info` never becomes a
 * fill under a label here — a ruling this comment carries, not a guard any sweep
 * enforces: the palette check accepts the colour anywhere in a mail. It is used
 * the way the app's `Alert` uses it, through the composited tints below, and
 * `palette-contrast.test.ts` pins the white pairing as rejected so the
 * measurement, at least, stays measured rather than remembered.
 */
export const STATUS = {
  info: "#308CE8",
  infoForeground: "#ffffff",
} as const;

/**
 * The app's `Alert` in its `info` variant, pre-composited for email.
 *
 * The component's `bg-info/10` is flattened against the
 * ground they actually sit on — the message panel, not the shell's darker
 * background behind it. Composite over the wrong ground and the tint is a
 * visible rectangle rather than a wash.
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
