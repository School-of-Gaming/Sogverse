/**
 * Token name → the Tailwind utility that spends it.
 *
 * Written out as literals rather than composed at render time, because Tailwind
 * scans source text: a class built as `` `bg-${token}` `` is a class that does
 * not exist in the stylesheet. Every entry here is one of the theme's own
 * semantic names — there is no raw palette class and no hex anywhere in the
 * demo.
 */

/**
 * A lookup keyed by a name built at runtime (`yty-${id}-soft`), so a miss is
 * possible in the types even where the map is exhaustive in practice. Saying so
 * is what makes the `?? ""` at each call site honest rather than defensive.
 */
type TokenClasses = Record<string, string | undefined>;

export const FILL: TokenClasses = {
  background: "bg-background",
  foreground: "bg-foreground",
  card: "bg-card",
  accent: "bg-accent",
  muted: "bg-muted",
  "muted-foreground": "bg-muted-foreground",
  border: "bg-border",
  primary: "bg-primary",
  secondary: "bg-secondary",
  "yty-harmony-strong": "bg-yty-harmony-strong",
  "yty-harmony-soft": "bg-yty-harmony-soft",
  "yty-glow-strong": "bg-yty-glow-strong",
  "yty-glow-soft": "bg-yty-glow-soft",
  "yty-valor-strong": "bg-yty-valor-strong",
  "yty-valor-soft": "bg-yty-valor-soft",
  "yty-wit-strong": "bg-yty-wit-strong",
  "yty-wit-soft": "bg-yty-wit-soft",
};

/** Face id → the family utility the theme generates for its token. */
export const FACE_CLASS: TokenClasses = {
  sans: "font-sans",
  serif: "font-serif",
  brandMono: "font-brand-mono",
  cursive: "font-cursive",
};

/** Numeric weight → the utility that sets it. Only weights a face actually loads appear. */
export const WEIGHT_CLASS: Record<number, string | undefined> = {
  400: "font-normal",
  500: "font-medium",
  600: "font-semibold",
  700: "font-bold",
};

/** Scale step id → the `text-*` utility carrying its size, line height and weight. */
export const STEP_CLASS: TokenClasses = {
  h1: "text-h1",
  h2: "text-h2",
  h3: "text-h3",
  h4: "text-h4",
  "body-l": "text-body-l",
  "body-s": "text-body-s",
  cta: "text-cta",
};

/** The narrow-viewport step, for the steps that have one. */
export const STEP_MOBILE_CLASS: TokenClasses = {
  h1: "text-h1-mobile",
};
