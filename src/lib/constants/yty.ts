import { YTY_ELEMENT_GRAMMAR } from "@sog/ui";

/**
 * The Four Yty-Elements — the core values of School of Gaming. The names and
 * descriptions here are the canonical English wording; the rendered copy comes
 * from the `yty.elements.*` messages, which carry the same words per locale.
 *
 * **The glyphs are not chosen here.** Which mark an element wears is a brand
 * decision, so it lives in SOG-UI's tone grammar beside the product kinds' and
 * is read from there; a new visual identity changes the mark in the library and
 * every surface below follows without an edit. What is left in this file is the
 * element's own identity — its id, its English name and description — and the
 * class strings a Sogverse surface paints with.
 *
 * The library ships its own copy of the icon set, at its own release, so a
 * glyph from it and one Sogverse imports are values from two installs of the
 * same package. Nothing has to bridge them: an icon component's type is
 * structural — the same props, the same ref — so a library glyph satisfies a
 * `LucideIcon` field downstream. If the two ever diverge in shape, this is the
 * seam to adapt at, and it stays a single seam because no Sogverse module
 * reaches past this one for an element's mark.
 *
 * Each element's classes name the @sog/ui family, which is one colour: the same
 * token inks the accent line, tints the tile and draws the ring. The `/10` and
 * `/5` steps on the tile and the gradient are the pre-library recipe — a family
 * exists at its authored value, and a fraction of it over the dark ground is a
 * duller colour than the family — and they stay until the icon-tile question
 * (§9's chip-scale exemption) is ruled.
 */
export const YTY_ELEMENTS = [
  {
    id: "harmony",
    name: "Harmony",
    description: "Your relationship with yourself",
    icon: YTY_ELEMENT_GRAMMAR.harmony.glyph,
    color: {
      bg: "bg-yty-harmony/10",
      bgGradient: "from-yty-harmony/10 to-yty-harmony/5",
      accent: "text-yty-harmony",
      ring: "ring-yty-harmony",
    },
  },
  {
    id: "glow",
    name: "Glow",
    description: "Your relationship with others",
    icon: YTY_ELEMENT_GRAMMAR.glow.glyph,
    color: {
      bg: "bg-yty-glow/10",
      bgGradient: "from-yty-glow/10 to-yty-glow/5",
      accent: "text-yty-glow",
      ring: "ring-yty-glow",
    },
  },
  {
    id: "valor",
    name: "Valor",
    description: "Your relationship with society",
    icon: YTY_ELEMENT_GRAMMAR.valor.glyph,
    color: {
      bg: "bg-yty-valor/10",
      bgGradient: "from-yty-valor/10 to-yty-valor/5",
      accent: "text-yty-valor",
      ring: "ring-yty-valor",
    },
  },
  {
    id: "wit",
    name: "Wit",
    description: "Your relationship with technology",
    icon: YTY_ELEMENT_GRAMMAR.wit.glyph,
    color: {
      bg: "bg-yty-wit/10",
      bgGradient: "from-yty-wit/10 to-yty-wit/5",
      accent: "text-yty-wit",
      ring: "ring-yty-wit",
    },
  },
] as const;

export type YtyElementId = (typeof YTY_ELEMENTS)[number]["id"];
export type YtyElement = (typeof YTY_ELEMENTS)[number];
