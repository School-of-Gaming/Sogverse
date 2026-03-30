// Hex equivalents of globals.css CSS custom properties.
// Email templates can't use CSS variables, so we maintain hex values here.
// If you change a color in globals.css, update the matching value here.

export const BRAND = { primary: "#FAA901", secondary: "#8F00E2" } as const;

// Hero gradient colors pre-blended over the dark background for email compatibility.
// primary(20%) over #121212 = #40300F, secondary(10%) over #121212 = #1F1027
export const GRADIENT = { primaryGlow: "#40300F", secondaryGlow: "#1F1027" } as const;

export const STATUS = {
  success: "#2EB88A",    // --success: 160 60% 45%
  warning: "#E7B008",    // --warning: 45 93% 47%
} as const;

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
  footerText: "#555555",
} as const;
