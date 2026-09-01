import { Heart, Sun, Sword, Brain } from "lucide-react";

/**
 * The Four Yty-Elements — the core values of School of Gaming. The names and
 * descriptions here are the canonical English wording; the rendered copy comes
 * from the `yty.elements.*` messages, which carry the same words per locale.
 *
 * **Four class slots per element**, and there used to be five. The fifth was
 * `bgGradient`, a same-hue fade behind the decorative element grid the gamer
 * dashboard once carried; the help restructure deleted that grid and nothing
 * rendered the slot afterwards, so it went rather than being held open for a
 * construct nobody draws.
 *
 * **Which variant feeds which slot is decided by `scripts/yty-contrast.mjs`,
 * not by eye.** Every pairing is measured against both grounds — the page
 * (`#121212`) and the card (`#1a1a1a`) these pairings are actually drawn on.
 * The card is the lighter one, so its numbers are the binding ones and are the
 * ones quoted here:
 *
 * - **`accent` takes the soft variant, on all four elements.** The accent class
 *   carries body-size text as well as icons — the About page's elements section
 *   renders the element's description in it at `text-sm`, directly on the card —
 *   so the binding threshold is 4.5:1, not 3:1. Wit-strong (`#3A71DE`) measures
 *   3.81:1 on the card: fine for a 24px icon, short of body copy. Soft clears
 *   it on every element (7.15 / 8.21 / 8.18 / 7.53), and using soft uniformly
 *   is what keeps the four elements one family rather than
 *   three-plus-an-exception.
 * - **`bg`, `border` and `ring` take the strong variant.** None of them carries
 *   text: the tint is a 10% wash behind an icon, the border is a full-value
 *   family edge, and the ring is a non-text state indicator where the 3:1 bar
 *   applies and even wit-strong clears it. Strong is the truer brand hue, and at
 *   that alpha it is what keeps a wash from washing out.
 * - **The edge is drawn at full value, and this construct's tint ground is the
 *   ruled exemption to the shading rule** (owner, 2026-09-01, choosing it
 *   knowing it held colour: "the border is colored. I want the icon's border to
 *   have color"). A chip-scale tile accenting an icon is not a colour painted as
 *   a card's ground, which is what the rule is aimed at; the `/30` edge it used
 *   to carry *was* bound by the rule, and was the muddy valor edge the owner
 *   disliked. Final form: tint ground, full-value family edge, soft glyph. The
 *   app's own foreground over the 10% tint measures 12.5–13.5:1 on the card, so
 *   that pairing constrains nothing — and the tightest pairing of the lot, the
 *   zone's soft label over its own 10% strong tint, still clears at 6.32:1
 *   (harmony, the worst of the four).
 *
 * The visible cost, accepted at sign-off: wit's two variants are further apart
 * in hue than the other three pairs are (`#3A71DE` royal against `#4DB3F5`
 * sky), so a wit card shows a light-blue glyph on a royal-blue wash. That is
 * the numbers' answer, not a preference.
 *
 * Classes are literal strings because Tailwind scans source text — a templated
 * `bg-yty-${id}-strong/10` emits a class name with no rule behind it.
 */
export const YTY_ELEMENTS = [
  {
    id: "harmony",
    name: "Harmony",
    description: "Your relationship with yourself",
    icon: Heart,
    color: {
      bg: "bg-yty-harmony-strong/10",
      border: "border-yty-harmony-strong",
      accent: "text-yty-harmony-soft",
      ring: "ring-yty-harmony-strong",
    },
  },
  {
    id: "glow",
    name: "Glow",
    description: "Your relationship with others",
    icon: Sun,
    color: {
      bg: "bg-yty-glow-strong/10",
      border: "border-yty-glow-strong",
      accent: "text-yty-glow-soft",
      ring: "ring-yty-glow-strong",
    },
  },
  {
    id: "valor",
    name: "Valor",
    description: "Your relationship with society",
    icon: Sword,
    color: {
      bg: "bg-yty-valor-strong/10",
      border: "border-yty-valor-strong",
      accent: "text-yty-valor-soft",
      ring: "ring-yty-valor-strong",
    },
  },
  {
    id: "wit",
    name: "Wit",
    description: "Your relationship with technology",
    icon: Brain,
    color: {
      bg: "bg-yty-wit-strong/10",
      border: "border-yty-wit-strong",
      accent: "text-yty-wit-soft",
      ring: "ring-yty-wit-strong",
    },
  },
] as const;

export type YtyElementId = (typeof YTY_ELEMENTS)[number]["id"];
export type YtyElement = (typeof YTY_ELEMENTS)[number];
