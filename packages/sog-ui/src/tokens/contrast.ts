/**
 * Contrast, measured rather than assumed.
 *
 * The brand's hues were tuned for a white page and this library ships one theme
 * and it is dark, so every pairing it ships has to be measured against the
 * grounds it actually sits on. `PAIRINGS` is that list: each entry names a
 * foreground token, a ground token, the threshold it is held to, and why that
 * threshold and not the other one. A unit test walks the whole list, so a hue
 * cannot be retuned without the pairing it breaks failing out loud.
 *
 * WCAG AA is **4.5:1 for body-size text** and **3:1 for large text and
 * non-text glyphs**. Which one applies is a property of the usage, not of the
 * colour, which is why a pairing has to say what it is for.
 *
 * The math is WCAG 2.x, ported from the design pass's audit script.
 */

import {
  BRAND,
  NEUTRALS,
  STATUS,
  YTY_FAMILIES,
  type Hex,
  type YtyFamilyId,
} from "./brand";

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

/**
 * `over` composited on `under` at the given alpha (simple source-over).
 *
 * Exported for the contexts that cannot do alpha at all — an email client, a
 * canvas — where a tint has to be flattened against the ground it sits on
 * before it is written down. Composite over the wrong ground and the tint is a
 * visible rectangle rather than a wash.
 */
export function composite(over: string, under: string, alpha: number): Hex {
  const a = hexToRgb(over);
  const b = hexToRgb(under);
  const channels = a.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)));
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
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

/** The three grounds the palette sits on. Muted is the lightest, so it is the binding one. */
const GROUNDS = [
  { token: "background", hex: NEUTRALS.background.hex, label: "the page" },
  { token: "card", hex: NEUTRALS.card.hex, label: "a card" },
  { token: "muted", hex: NEUTRALS.muted.hex, label: "the muted ground" },
] as const;

const INK: PairingSide = { token: "background", hex: NEUTRALS.background.hex };
const WHITE: PairingSide = { token: "secondary-foreground", hex: BRAND.secondary.foreground };

const YTY_IDS = [
  "harmony",
  "glow",
  "valor",
  "wit",
] as const satisfies readonly YtyFamilyId[];

/**
 * Every Yty family's **soft** variant as text, on all three grounds. Soft is
 * what carries text and glyphs in this palette; strong is for fills and edges.
 */
const softAsText: Pairing[] = YTY_IDS.flatMap((id) =>
  GROUNDS.map((ground) => ({
    id: `yty-${id}-soft-on-${ground.token}`,
    foreground: { token: `yty-${id}-soft`, hex: YTY_FAMILIES[id].soft },
    background: { token: ground.token, hex: ground.hex },
    threshold: THRESHOLDS.bodyText,
    why: `${YTY_FAMILIES[id].name}'s soft variant set as body text on ${ground.label}.`,
  })),
);

/**
 * The fills a grammar-coloured button draws, each under dark ink.
 *
 * Three families fill **strong**; wit fills **soft**, because wit-strong is
 * 4.10:1 against dark ink and misses the body floor a 16px CTA label sits
 * under. That substitution is the one asymmetry in the recipe and it is a
 * measurement, not a preference.
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
  why: `Dark ink on a ${YTY_FAMILIES[family].name} fill — a grammar-coloured button's 16px label.`,
}));

/**
 * Wit-strong on each ground, at the glyph threshold and not the body one.
 *
 * This is the pairing that shapes the whole strong/soft doctrine: wit-strong
 * clears 3:1 on all three grounds and clears 4.5:1 on none of them, so it may
 * draw a mark, an edge or a swatch and may never be set as text. `--info` *is*
 * wit-strong, so an info-toned label spells wit-soft while an info border and
 * an info fill stand.
 */
const witStrongAsGlyph: Pairing[] = GROUNDS.map((ground) => ({
  id: `yty-wit-strong-on-${ground.token}`,
  foreground: { token: "yty-wit-strong", hex: YTY_FAMILIES.wit.strong },
  background: { token: ground.token, hex: ground.hex },
  threshold: THRESHOLDS.largeTextAndGlyphs,
  why: `Wit-strong as a glyph or edge on ${ground.label}. It clears 3:1 here and misses 4.5:1 on every ground, which is why wit's text always takes soft.`,
}));

/** The app's own text tokens, on the two grounds a page is built from. */
const appTextOnGrounds: Pairing[] = (
  [
    ["foreground", NEUTRALS.foreground.hex, "Body copy"],
    ["muted-foreground", NEUTRALS.mutedForeground.hex, "Secondary text, captions and metadata"],
  ] as const
).flatMap(([token, hex, label]) =>
  GROUNDS.slice(0, 2).map((ground) => ({
    id: `${token}-on-${ground.token}`,
    foreground: { token, hex },
    background: { token: ground.token, hex: ground.hex },
    threshold: THRESHOLDS.bodyText,
    why: `${label} on ${ground.label}.`,
  })),
);

/** The two signature colours, each under the ink it carries — and amber as text, which the dark ground makes safe. */
const brandPairings: Pairing[] = [
  {
    id: "ink-on-primary",
    foreground: INK,
    background: { token: "primary", hex: BRAND.primary.hex },
    threshold: THRESHOLDS.bodyText,
    why: "Dark ink on the amber fill — the primary CTA, and the pairing the whole act grammar rests on.",
  },
  {
    id: "primary-on-background",
    foreground: { token: "primary", hex: BRAND.primary.hex },
    background: { token: "background", hex: NEUTRALS.background.hex },
    threshold: THRESHOLDS.bodyText,
    why: "Amber set as text — a link, an inline act. The Guidebook rules this unsafe because it fails on white; on the dark ground it is the palette's highest-contrast colour.",
  },
  {
    id: "white-on-secondary",
    foreground: WHITE,
    background: { token: "secondary", hex: BRAND.secondary.hex },
    threshold: THRESHOLDS.bodyText,
    why: "White on the violet fill. Violet is a dark colour, so only a light label reads on it — the exact mirror of amber, which takes only a dark one.",
  },
];

/**
 * Each status hue as the mark that states it, on the page ground.
 *
 * The glyph threshold, uniformly, because `info` binds the set at 4.10:1 and
 * because a status is never carried by hue alone: a mark comes with a glyph and
 * a label, and the label is the app's own foreground at body size.
 */
const statusMarks: Pairing[] = (["success", "info", "warning", "destructive"] as const).map(
  (id) => ({
    id: `${id}-on-background`,
    foreground: { token: id, hex: STATUS[id].hex },
    background: { token: "background", hex: NEUTRALS.background.hex },
    threshold: THRESHOLDS.largeTextAndGlyphs,
    why: `The ${STATUS[id].name.toLowerCase()} mark on the page ground. A status never travels by hue alone, so this is a glyph beside a label rather than the label itself.`,
  }),
);

/** Each status fill under the foreground token it ships with. */
const statusFills: Pairing[] = [
  {
    id: "success-foreground-on-success",
    foreground: { token: "success-foreground", hex: STATUS.success.foreground },
    background: { token: "success", hex: STATUS.success.hex },
    threshold: THRESHOLDS.bodyText,
    why: "Dark ink on the success fill. White here measures 2.83:1 and clears neither floor, which is why this foreground is ink and not the white the reference branch carried.",
  },
  {
    id: "info-foreground-on-info",
    foreground: { token: "info-foreground", hex: STATUS.info.foreground },
    background: { token: "info", hex: STATUS.info.hex },
    threshold: THRESHOLDS.bodyText,
    why: "White on the info fill, a hair over the body floor.",
  },
  {
    id: "warning-foreground-on-warning",
    foreground: { token: "warning-foreground", hex: STATUS.warning.foreground },
    background: { token: "warning", hex: STATUS.warning.hex },
    threshold: THRESHOLDS.bodyText,
    why: "Dark ink on the warning fill.",
  },
  {
    id: "destructive-foreground-on-destructive",
    foreground: { token: "destructive-foreground", hex: STATUS.destructive.foreground },
    background: { token: "destructive", hex: STATUS.destructive.hex },
    threshold: THRESHOLDS.largeTextAndGlyphs,
    why: "White on the destructive fill — 3.76:1, which clears the glyph floor and MISSES the 4.5:1 a body-size button label sits under. Inherited from a value the design pass ruled untouched; recorded at the threshold it actually meets rather than at the one we would like it to.",
  },
];

/** Every foreground/ground pair the library ships, each with the threshold it is held to. */
export const PAIRINGS: readonly Pairing[] = [
  ...appTextOnGrounds,
  ...brandPairings,
  ...softAsText,
  ...fillUnderInk,
  ...witStrongAsGlyph,
  ...statusMarks,
  ...statusFills,
];

/** The measured ratio for a pairing. Computed on every call — never stored, never rounded into the data. */
export function measure(pairing: Pairing): number {
  return contrastRatio(pairing.foreground.hex, pairing.background.hex);
}

/** True when a pairing clears the threshold it is held to. */
export function passes(pairing: Pairing): boolean {
  return measure(pairing) >= pairing.threshold;
}

/**
 * Every pairing that involves a given token, on either side. This is what lets
 * a swatch show its own measurements without any surface restating a number.
 */
export function pairingsFor(token: string): Pairing[] {
  return PAIRINGS.filter(
    (pairing) =>
      pairing.foreground.token === token || pairing.background.token === token,
  );
}
