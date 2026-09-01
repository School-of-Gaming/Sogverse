// Hex equivalents of globals.css CSS custom properties.
// Email templates can't use CSS variables, so we maintain hex values here.
// If you change a color in globals.css, update the matching value here.

/**
 * The brand fills and the foreground each one carries.
 *
 * The two are always named together because they are not independent choices:
 * the primary is a light colour and only a dark label reads on it (#121212 at
 * 9.6:1; white is 2.0:1), the secondary is a dark colour and only a light label
 * reads on it (#ffffff at 6.4:1; the dark label is 2.9:1). They are mirror
 * images, so a button that swaps its fill and keeps its label has not changed
 * colour, it has broken. Both foregrounds mirror `--primary-foreground` and
 * `--secondary-foreground` in globals.css: an email is the web app's style
 * reaching someone's inbox, so a label here comes from the same named token the
 * app's button uses rather than from a value that happens to match today.
 */
export const BRAND = {
  primary: "#FAA901",
  primaryForeground: "#121212",
  secondary: "#8F00E2",
  secondaryForeground: "#ffffff",
} as const;

// Hero gradient colors pre-blended over the dark background for email compatibility.
// primary(20%) over #121212 = #40300F, secondary(10%) over #121212 = #1F1027
export const GRADIENT = { primaryGlow: "#40300F", secondaryGlow: "#1F1027" } as const;

/**
 * The four Yty elements, as the brand's exact hues.
 *
 * These used to be four raw Tailwind defaults and they were wrong on every
 * element — the brand fixes Harmony pink, Glow green, Valor orange, Wit blue,
 * and two of the stand-ins were effectively swapped (a green on Harmony, an
 * amber on Glow). Nothing imports this map today, which is exactly why it
 * had to be corrected rather than left: this file is the palette source an email
 * or an OG image reaches for, and a palette source documenting the wrong colour
 * is a trap set for whoever needs one first.
 *
 * Each element is a strong/soft pair mirroring `--color-yty-{element}-{variant}`
 * in globals.css, and it is keyed by element id rather than flattened to eight
 * names so a caller holding a `YtyElementId` can index it. Which variant to
 * reach for is settled by contrast, not taste: `node scripts/yty-contrast.mjs`
 * measures every pairing on both dark grounds, and the binding result is that
 * strong is for fills, borders and rings while soft is what carries text.
 */
export const YTY_ELEMENT = {
  harmony: { strong: "#F55B9A", soft: "#FA7FA3" },
  glow: { strong: "#1AB061", soft: "#6AC66B" },
  valor: { strong: "#FD700D", soft: "#FF993D" },
  wit: { strong: "#3A71DE", soft: "#4DB3F5" },
} as const;

export const DARK_THEME = {
  bg: "#121212",         // --background: 0 0% 7%
  card: "#1a1a1a",       // --card: 0 0% 10%
  foreground: "#ededed", // --foreground: 0 0% 93%
  border: "#333333",     // --border: 0 0% 20%
  mutedFg: "#a6a6a6",    // --muted-foreground: 0 0% 65%
} as const;

/**
 * The status fills mirrored from globals.css, and the foreground each carries.
 *
 * Only `info` is here, because only `info` has been needed. Mirroring a colour
 * no mail uses would put an unmeasured value in the palette and read as an
 * invitation to reach for it; add `destructive`/`success`/`warning` when a mail
 * actually needs one, and measure it in the same change.
 *
 * The foreground is named beside the fill because a fill and its foreground are
 * one decision, and the design pass changed the arithmetic of this one: `--info`
 * converged onto wit-strong, and white on that blue measures 4.57:1 — a hair
 * over the 4.5:1 body floor, where the blue it replaced was 3.48:1 and a hair
 * under. So the reason `info` is not a fill under a label in a mail is now a
 * design choice rather than a contrast constraint; it is used the way the app's
 * `Alert` uses it, through the composited tints below. `palette-contrast.test.ts`
 * is where these pairings stay measured rather than remembered.
 */
export const STATUS = {
  info: "#3A71DE",           // --info: 219.9 71.3% 54.9%
  infoForeground: "#ffffff", // --info-foreground: 0 0% 100%
} as const;

// The app's `Alert` in its `info` variant, pre-composited for email the same way
// the hero gradient above is: a client cannot be relied on for alpha, so the
// component's `border-info/50` and `bg-info/10` are flattened against the ground
// they actually sit on — the message panel (DARK_THEME.card), not the shell's
// darker background behind it. Composite over the wrong ground and the tint is a
// visible rectangle rather than a wash.
// info(50%) over #1a1a1a = #2A467C, info(10%) over #1a1a1a = #1D232E
export const STATUS_TINT = { infoBorder: "#2A467C", infoSurface: "#1D232E" } as const;

// A footer grey of #555555 used to live here. It mirrored no token in
// globals.css — the only value in this module that did not — and it was 2.51:1
// on the background, below AA and below AA-large, which is worse than the purple
// body text this codebase rejects outright as unreadable. Small, grey and legal
// are three different things. Footers use mutedFg (7.70:1) like every other
// secondary text in the product.
