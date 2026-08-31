import { Heart, Sun, Sword, Brain } from "lucide-react";

/**
 * The Four Yty-Elements — the core values of School of Gaming. The names and
 * descriptions here are the canonical English wording; the rendered copy comes
 * from the `yty.elements.*` messages, which carry the same words per locale.
 */
export const YTY_ELEMENTS = [
  {
    id: "harmony",
    name: "Harmony",
    description: "Your relationship with yourself",
    icon: Heart,
    color: {
      bg: "bg-yty-harmony/10",
      bgGradient: "from-yty-harmony/10 to-yty-harmony/5",
      border: "border-yty-harmony/30",
      accent: "text-yty-harmony",
      ring: "ring-yty-harmony",
    },
  },
  {
    id: "glow",
    name: "Glow",
    description: "Your relationship with others",
    icon: Sun,
    color: {
      bg: "bg-yty-glow/10",
      bgGradient: "from-yty-glow/10 to-yty-glow/5",
      border: "border-yty-glow/30",
      accent: "text-yty-glow",
      ring: "ring-yty-glow",
    },
  },
  {
    id: "valor",
    name: "Valor",
    description: "Your relationship with society",
    icon: Sword,
    color: {
      bg: "bg-yty-valor/10",
      bgGradient: "from-yty-valor/10 to-yty-valor/5",
      border: "border-yty-valor/30",
      accent: "text-yty-valor",
      ring: "ring-yty-valor",
    },
  },
  {
    id: "wit",
    name: "Wit",
    description: "Your relationship with technology",
    icon: Brain,
    color: {
      bg: "bg-yty-wit/10",
      bgGradient: "from-yty-wit/10 to-yty-wit/5",
      border: "border-yty-wit/30",
      accent: "text-yty-wit",
      ring: "ring-yty-wit",
    },
  },
] as const;

export type YtyElementId = (typeof YTY_ELEMENTS)[number]["id"];
export type YtyElement = (typeof YTY_ELEMENTS)[number];

/**
 * The five class slots every Yty presentation fills.
 *
 * Declared structurally rather than derived from `YTY_ELEMENTS`: that array is
 * `as const`, so its `color` objects have literal string types and a type read
 * off them would only accept the exact classes already written there.
 */
export interface YtyElementColor {
  bg: string;
  bgGradient: string;
  border: string;
  accent: string;
  ring: string;
}

/**
 * **Design-pass draft — the brand's own Yty hues, on the dark ground.**
 *
 * Consumed only by the preview scenes (`palette="brand"`); no live route reads
 * it, so promoting the palette means replacing `YTY_ELEMENTS[n].color` with
 * these classes and deleting this export — not adding a second permanent map.
 *
 * **Which variant feeds which slot is decided by `scripts/yty-contrast.mjs`,
 * not by eye.** Every pairing is measured against both grounds — the page
 * (`#121212`) and the card (`#1a1a1a`) these pairings are actually drawn on.
 * The card is the lighter one, so its numbers are the binding ones and are the
 * ones quoted here:
 *
 * - **`accent` takes the soft variant, on all four elements.** The accent class
 *   carries body-size text as well as icons — the home section renders the
 *   element's description in it at `text-sm`, directly on the card — so the
 *   binding threshold is 4.5:1, not 3:1. Wit-strong (`#3A71DE`) measures
 *   3.81:1 on the card: fine for a 24px icon, short of body copy. Soft clears
 *   it on every element (7.15 / 8.21 / 8.18 / 7.53), and using soft uniformly
 *   is what keeps the four elements one family rather than
 *   three-plus-an-exception.
 * - **`bg`, `bgGradient`, `border` and `ring` take the strong variant.** None
 *   of them carries text: the tints are 10% and 5% washes behind an icon, the
 *   border is a 30% card edge, and the ring is a non-text state indicator where
 *   the 3:1 bar applies and even wit-strong clears it. Strong is the truer
 *   brand hue, and at those alphas it is what keeps a wash from washing out.
 *   The app's own foreground over the 10% tint measures 12.5–13.5:1 on the
 *   card, so that pairing constrains nothing — and the tightest pairing of the
 *   lot, the zone's soft label over its own 10% strong tint, still clears at
 *   6.32:1 (harmony, the worst of the four).
 *
 * The visible cost, and the thing worth the owner's eye in the scenes: wit's
 * two variants are further apart in hue than the other three pairs are
 * (`#3A71DE` royal against `#4DB3F5` sky), so a wit card shows a light-blue
 * glyph on a royal-blue wash. That is the numbers' answer, not a preference.
 *
 * Classes are literal strings for the same reason the live map's are — Tailwind
 * scans source text, and a templated `bg-yty-${id}-strong/10` emits a class name
 * with no rule behind it.
 */
export const YTY_ELEMENT_DRAFT_COLORS: Record<YtyElementId, YtyElementColor> = {
  harmony: {
    bg: "bg-yty-harmony-strong/10",
    bgGradient: "from-yty-harmony-strong/10 to-yty-harmony-strong/5",
    border: "border-yty-harmony-strong/30",
    accent: "text-yty-harmony-soft",
    ring: "ring-yty-harmony-strong",
  },
  glow: {
    bg: "bg-yty-glow-strong/10",
    bgGradient: "from-yty-glow-strong/10 to-yty-glow-strong/5",
    border: "border-yty-glow-strong/30",
    accent: "text-yty-glow-soft",
    ring: "ring-yty-glow-strong",
  },
  valor: {
    bg: "bg-yty-valor-strong/10",
    bgGradient: "from-yty-valor-strong/10 to-yty-valor-strong/5",
    border: "border-yty-valor-strong/30",
    accent: "text-yty-valor-soft",
    ring: "ring-yty-valor-strong",
  },
  wit: {
    bg: "bg-yty-wit-strong/10",
    bgGradient: "from-yty-wit-strong/10 to-yty-wit-strong/5",
    border: "border-yty-wit-strong/30",
    accent: "text-yty-wit-soft",
    ring: "ring-yty-wit-strong",
  },
};

/**
 * Which Yty palette a surface draws in — and, on the home page, at what dose.
 *
 * `"current"` is the live map and the default, so a route that does not opt in
 * renders exactly what it rendered before. The two `brand*` values are both the
 * draft map above; they differ only in how far the *rest* of a page spends the
 * same four families:
 *
 * - `"brand"` — accents.
 * - `"brand-lively"` — the marketing site's brightness, at whole-field strength.
 *
 * **Neither draws a two-hue blend anywhere, and that is the settled default
 * rather than a variant.** Brand-hue gradients are a Sogverse invention rather
 * than a Guidebook construct — a crutch from the two-colour era — and the owner's
 * direction is that they smear colours we no longer need to smear. So both doses
 * lay colour down as flat fields and single-hue washes; a gradient now needs a
 * case made for it, one site at a time.
 *
 * **A single-hue fade is a wash, not a smear.** One hue fading to transparent
 * introduces no second colour and invents nothing — the element cards'
 * `bgGradient` slot and the accented hero's harmony radial are both that shape —
 * so they are outside the retirement and stay.
 *
 * The element cards themselves are identical under both doses, which is
 * deliberate: the open questions are about the page around them, and varying
 * both at once would make the comparison unreadable.
 *
 * Only the preview scenes pass anything but `"current"`, and the whole type
 * retires with the draft map at promotion.
 */
export type YtyPalette = "current" | "brand" | "brand-lively";

/** The five class slots for one element under the requested palette. */
export function ytyElementColor(
  element: YtyElement,
  palette: YtyPalette,
): YtyElementColor {
  return palette === "current" ? element.color : YTY_ELEMENT_DRAFT_COLORS[element.id];
}
