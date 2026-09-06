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

import {
  BRAND,
  NEUTRALS,
  STATUS,
  STATUS_IDS,
  STATUS_INK,
  YTY_FAMILIES,
  statusHex,
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
  /** The theme token without its `--color-` prefix, e.g. `yty-wit` or `warning`. */
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
 * `lifted` is the lightest of the three, so it binds: a foreground that clears
 * its threshold there clears it on the card and on the page. Measuring all
 * three rather than only the binding one is what makes that claim checkable
 * instead of remembered.
 */
export const GROUNDS = [
  { token: "background", hex: NEUTRALS.background.hex, label: "the page" },
  { token: "card", hex: NEUTRALS.card.hex, label: "a card" },
  { token: "lifted", hex: NEUTRALS.lifted.hex, label: "a lifted block" },
] as const;

const INK: PairingSide = { token: "background", hex: NEUTRALS.background.hex };
const WHITE: PairingSide = {
  token: "world-foreground",
  hex: BRAND.world.foreground,
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
    id: "ink-on-act",
    foreground: INK,
    background: { token: "act", hex: BRAND.act.hex },
    threshold: THRESHOLDS.bodyText,
    why: "Dark ink on the amber act fill — the main call to action. Its label is body size, so it takes the body floor.",
  },
  {
    id: "white-on-world",
    foreground: WHITE,
    background: { token: "world", hex: BRAND.world.hex },
    threshold: THRESHOLDS.bodyText,
    why: "White on the violet world fill, a body-size label. Violet is a dark colour, so only a light label reads on it — the exact mirror of amber, which takes only a dark one.",
  },
];

/**
 * Every Yty family as **ink** — a label or a glyph — on every ground.
 *
 * Body size, so the body floor. A label is the only place a family colour is
 * ever set as type, and a glyph beside it clears the same bar with room to
 * spare, so one measurement covers both roles a family plays on a neutral
 * ground.
 */
const familyAsInk: Pairing[] = YTY_IDS.flatMap((id) =>
  GROUNDS.map((ground) => ({
    id: `yty-${id}-on-${ground.token}`,
    foreground: { token: `yty-${id}`, hex: YTY_FAMILIES[id].hex },
    background: { token: ground.token, hex: ground.hex },
    threshold: THRESHOLDS.bodyText,
    why: `${YTY_FAMILIES[id].name} as a label on ${ground.label}, at body size and so at the body floor. Its glyph clears the same pairing by a wider margin.`,
  })),
);

/**
 * Every Yty family as a **fill**, under the dark ink it carries.
 *
 * One entry per family, because a family is one colour: the same hex that inks a
 * label fills the chip the label sits in, and this is the other half of that
 * value's proof. No family fill takes a white label — none of the four clears
 * the body floor against white — which is what removes white from the palette's
 * fills altogether.
 */
const familyUnderInk: Pairing[] = YTY_IDS.map((id) => ({
  id: `ink-on-yty-${id}`,
  foreground: INK,
  background: { token: `yty-${id}`, hex: YTY_FAMILIES[id].hex },
  threshold: THRESHOLDS.bodyText,
  why: `Dark ink on a ${YTY_FAMILIES[id].name} fill — a family-coloured chip or button label, at body size and so at the body floor.`,
}));

/**
 * Every status as **ink** on every ground, and as a **fill** under its own ink.
 *
 * Two of the four resolve to a family's hex and are therefore measured twice —
 * once as `yty-glow`, once as `success`. That is deliberate rather than
 * redundant: the ledger is keyed on the **token** a consumer writes, so a
 * pairing the library offers under a name is proven under that name. If success
 * ever stopped pointing at Glow, its rows would go on being measured without
 * anybody having to remember to add them.
 */
const statusAsInk: Pairing[] = STATUS_IDS.flatMap((id) =>
  GROUNDS.map((ground) => ({
    id: `${id}-on-${ground.token}`,
    foreground: { token: id, hex: statusHex(id) },
    background: { token: ground.token, hex: ground.hex },
    threshold: THRESHOLDS.bodyText,
    why: `${STATUS[id].name} as the label of a state on ${ground.label}, at body size and so at the body floor. Its glyph clears the same pairing by a wider margin.`,
  })),
);

const statusUnderInk: Pairing[] = STATUS_IDS.map((id) => ({
  id: `ink-on-${id}`,
  foreground: { token: `${id}-foreground`, hex: STATUS_INK },
  background: { token: id, hex: statusHex(id) },
  threshold: THRESHOLDS.bodyText,
  why: `A ${STATUS[id].name} label on a ${STATUS[id].name} fill — a badge, at body size and so at the body floor. Every status fill carries this one ink; none of the four clears the floor under white.`,
}));

/** Every foreground/ground pair the library ships, each with the threshold it is held to. */
export const PAIRINGS: readonly Pairing[] = [
  ...appTextOnGrounds,
  ...brandPairings,
  ...familyAsInk,
  ...familyUnderInk,
  ...statusAsInk,
  ...statusUnderInk,
];

/** The measured ratio for a pairing. Computed on every call — never stored, never rounded into the data. */
export function measure(pairing: Pairing): number {
  return contrastRatio(pairing.foreground.hex, pairing.background.hex);
}
