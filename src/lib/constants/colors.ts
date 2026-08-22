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

export const YTY_ELEMENT = {
  harmony: "#34d399",
  glow: "#fbbf24",
  valor: "#fb7185",
  wit: "#a78bfa",
} as const;

export const DARK_THEME = {
  bg: "#121212",         // --background: 0 0% 7%
  card: "#1a1a1a",       // --card: 0 0% 10%
  foreground: "#ededed", // --foreground: 0 0% 93%
  border: "#333333",     // --border: 0 0% 20%
  mutedFg: "#a6a6a6",    // --muted-foreground: 0 0% 65%
} as const;

// A footer grey of #555555 used to live here. It mirrored no token in
// globals.css — the only value in this module that did not — and it was 2.51:1
// on the background, below AA and below AA-large, which is worse than the purple
// body text this codebase rejects outright as unreadable. Small, grey and legal
// are three different things. Footers use mutedFg (7.70:1) like every other
// secondary text in the product.
