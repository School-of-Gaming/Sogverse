/**
 * Contrast, measured rather than assumed.
 *
 * **A consumer trusts this library to have proven every pairing it offers.** A
 * colour offered for text on a ground is safe on that ground; a pairing that is
 * not in `PAIRINGS` is not available, and no surface may invent one. The proof
 * is the test: it walks this whole list and fails if a single entry stops
 * clearing the threshold it is held to, so a retuned hue cannot pass quietly.
 *
 * `PAIRINGS` is therefore the complete ledger of what the library ships, not a
 * sample of it. A pairing left out of the list is not an unmeasured pairing, it
 * is a pairing the library does not offer.
 *
 * WCAG AA is **4.5:1 for body-size text** and **3:1 for large text and non-text
 * glyphs**. Which one applies is a property of the usage, not of the colour,
 * which is why every entry says what it is for: the same hue can be safe as a
 * mark and unsafe as a sentence.
 *
 * The math is WCAG 2.x, computed here from the authored hexes so that no ratio
 * is ever typed by hand.
 */

import { BRAND, NEUTRALS, YTY_FAMILIES, type Hex, type YtyFamilyId } from "./brand";

export type Rgb = readonly [number, number, number];

/** `#RRGGBB` → `[r, g, b]` in 0–255. */
export function hexToRgb(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG 2.x relative luminance (sRGB, the 0.03928 / 2.4 formulation). */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1–21. Symmetric in its arguments. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The two AA floors. A pairing states which it is held to and why. */
export const THRESHOLDS = {
  /** WCAG 1.4.3 — text below 18.66px bold / 24px regular. */
  bodyText: 4.5,
  /** WCAG 1.4.3 large text and 1.4.11 non-text contrast — glyphs, icons, marks. */
  largeTextAndGlyphs: 3,
} as const;

export type Threshold = (typeof THRESHOLDS)[keyof typeof THRESHOLDS];

/** One end of a pairing: the semantic token, so two tokens sharing a hex stay distinguishable. */
export type PairingSide = {
  /** The theme token without its `--color-` prefix, e.g. `yty-wit-soft`. */
  readonly token: string;
  readonly hex: Hex;
};

export type Pairing = {
  readonly id: string;
  /** What is drawn — text, a glyph, or a label on a fill. */
  readonly foreground: PairingSide;
  /** What it is drawn on. */
  readonly background: PairingSide;
  readonly threshold: Threshold;
  /** One line: what this pairing is, and why it takes this threshold. */
  readonly why: string;
};

/**
 * Every ground the library fills — the complete set a text token can land on.
 *
 * `muted` is the lightest of the four, so it binds: a foreground that clears
 * its threshold there clears it on the hover fill, on the card and on the page.
 * Measuring all four rather than only the binding one is what makes that claim
 * checkable instead of remembered.
 */
const GROUNDS = [
  { token: "background", hex: NEUTRALS.background.hex, label: "the page" },
  { token: "card", hex: NEUTRALS.card.hex, label: "a card" },
  { token: "accent", hex: NEUTRALS.accent.hex, label: "a row under the pointer" },
  { token: "muted", hex: NEUTRALS.muted.hex, label: "a de-emphasised block" },
] as const;

const INK: PairingSide = { token: "background", hex: NEUTRALS.background.hex };
const WHITE: PairingSide = {
  token: "secondary-foreground",
  hex: BRAND.secondary.foreground,
};

const YTY_IDS = [
  "harmony",
  "glow",
  "valor",
  "wit",
] as const satisfies readonly YtyFamilyId[];

/**
 * The app's own text tokens, on every ground the library fills.
 *
 * Body size, so the body floor: these are the pairings a whole paragraph is set
 * in, and secondary text on the lightest ground is where the set comes closest
 * to that floor.
 */
const appTextOnGrounds: Pairing[] = (
  [
    ["foreground", NEUTRALS.foreground.hex, "Body copy"],
    [
      "muted-foreground",
      NEUTRALS.mutedForeground.hex,
      "Secondary text, captions and metadata",
    ],
  ] as const
).flatMap(([token, hex, label]) =>
  GROUNDS.map((ground) => ({
    id: `${token}-on-${ground.token}`,
    foreground: { token, hex },
    background: { token: ground.token, hex: ground.hex },
    threshold: THRESHOLDS.bodyText,
    why: `${label} on ${ground.label}.`,
  })),
);

/** The two signature colours, each under the ink it carries. */
const brandPairings: Pairing[] = [
  {
    id: "ink-on-primary",
    foreground: INK,
    background: { token: "primary", hex: BRAND.primary.hex },
    threshold: THRESHOLDS.bodyText,
    why: "Dark ink on the amber fill — the primary call to action. Its label is body size, so it takes the body floor.",
  },
  {
    id: "white-on-secondary",
    foreground: WHITE,
    background: { token: "secondary", hex: BRAND.secondary.hex },
    threshold: THRESHOLDS.bodyText,
    why: "White on the violet fill, a body-size label. Violet is a dark colour, so only a light label reads on it — the exact mirror of amber, which takes only a dark one.",
  },
];

/**
 * Every Yty family's **soft** variant as text, on every ground. Soft is what
 * carries text and glyphs in this palette; strong is for fills and edges.
 */
const softAsText: Pairing[] = YTY_IDS.flatMap((id) =>
  GROUNDS.map((ground) => ({
    id: `yty-${id}-soft-on-${ground.token}`,
    foreground: { token: `yty-${id}-soft`, hex: YTY_FAMILIES[id].soft },
    background: { token: ground.token, hex: ground.hex },
    threshold: THRESHOLDS.bodyText,
    why: `${YTY_FAMILIES[id].name}'s soft variant set as body text on ${ground.label}, so it takes the body floor.`,
  })),
);

/**
 * The fills a family-coloured button draws, each under dark ink.
 *
 * Three families fill **strong**; wit fills **soft**, because wit-strong misses
 * the body floor a button label sits under. That substitution is the one
 * asymmetry in the recipe, and it is a measurement rather than a preference.
 */
const FILL_RECIPE = [
  { family: "valor", variant: "strong" },
  { family: "harmony", variant: "strong" },
  { family: "glow", variant: "strong" },
  { family: "wit", variant: "soft" },
] as const satisfies readonly {
  family: YtyFamilyId;
  variant: "strong" | "soft";
}[];

const fillUnderInk: Pairing[] = FILL_RECIPE.map(({ family, variant }) => ({
  id: `ink-on-yty-${family}-${variant}`,
  foreground: INK,
  background: {
    token: `yty-${family}-${variant}`,
    hex: YTY_FAMILIES[family][variant],
  },
  threshold: THRESHOLDS.bodyText,
  why: `Dark ink on a ${YTY_FAMILIES[family].name} fill — a family-coloured button's label, at body size and so at the body floor.`,
}));

/** Every foreground/ground pair the library ships, each with the threshold it is held to. */
export const PAIRINGS: readonly Pairing[] = [
  ...appTextOnGrounds,
  ...brandPairings,
  ...softAsText,
  ...fillUnderInk,
];

/** The measured ratio for a pairing. Computed on every call — never stored, never rounded into the data. */
export function measure(pairing: Pairing): number {
  return contrastRatio(pairing.foreground.hex, pairing.background.hex);
}
