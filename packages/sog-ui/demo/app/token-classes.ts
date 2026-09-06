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
  lifted: "bg-lifted",
  "muted-foreground": "bg-muted-foreground",
  border: "bg-border",
  act: "bg-act",
  world: "bg-world",
  "yty-harmony": "bg-yty-harmony",
  "yty-glow": "bg-yty-glow",
  "yty-valor": "bg-yty-valor",
  "yty-wit": "bg-yty-wit",
  destructive: "bg-destructive",
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  "pick-1": "bg-pick-1",
  "pick-2": "bg-pick-2",
  "pick-3": "bg-pick-3",
  "pick-4": "bg-pick-4",
  "pick-5": "bg-pick-5",
  "pick-6": "bg-pick-6",
  "pick-7": "bg-pick-7",
  "pick-8": "bg-pick-8",
  "pick-9": "bg-pick-9",
  "pick-10": "bg-pick-10",
  "pick-11": "bg-pick-11",
  "pick-12": "bg-pick-12",
  "pick-13": "bg-pick-13",
  "pick-14": "bg-pick-14",
  "pick-15": "bg-pick-15",
  "pick-16": "bg-pick-16",
};

/**
 * The same tokens as foreground colours, for the glyphs and labels drawn in
 * them. Every hue has one, because every hue is one colour: the value that
 * fills a chip is the value that inks the label beside it, and there is no
 * second variant to reach for.
 *
 * A `-foreground` has no entry here. It is the ink a fill carries, so it is only
 * ever written on top of that fill and never on a neutral ground, which is the
 * one thing this map is for.
 */
export const INK: TokenClasses = {
  "yty-harmony": "text-yty-harmony",
  "yty-glow": "text-yty-glow",
  "yty-valor": "text-yty-valor",
  "yty-wit": "text-yty-wit",
  destructive: "text-destructive",
  success: "text-success",
  info: "text-info",
  warning: "text-warning",
};

/** A status fill's own label colour, for the badges the status floor draws. */
export const ON_FILL: TokenClasses = {
  destructive: "text-destructive-foreground",
  success: "text-success-foreground",
  info: "text-info-foreground",
  warning: "text-warning-foreground",
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
