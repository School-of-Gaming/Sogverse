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
 * token inks the accent line, draws the ring and draws the edge, at that value
 * and no other.
 *
 * **A family has no ground here, and it used to have two.** The tile behind an
 * element's mark was a 10% wash of the family and the card behind it a gradient
 * from 10% to 5% — a colour exists at its authored value or not at all, and a
 * fraction of it over the dark ground is a duller colour than the family. The
 * mark carries the family at full value, the square behind it is the lifted
 * grey every other tile in the app sits on, and the gradient is gone with no
 * replacement: nothing was reading it.
 *
 * **`edge` is what the tile gained instead of that ground.** A glyph tile is
 * the lifted neutral with a border in its glyph's hue, so the family reaches
 * the reader twice at full value — as the mark and as the line around it — and
 * never as a fraction of itself.
 */
export const YTY_ELEMENTS = [
  {
    id: "harmony",
    name: "Harmony",
    description: "Your relationship with yourself",
    icon: YTY_ELEMENT_GRAMMAR.harmony.glyph,
    color: {
      accent: "text-yty-harmony",
      edge: "border-yty-harmony",
      ring: "ring-yty-harmony",
    },
  },
  {
    id: "glow",
    name: "Glow",
    description: "Your relationship with others",
    icon: YTY_ELEMENT_GRAMMAR.glow.glyph,
    color: {
      accent: "text-yty-glow",
      edge: "border-yty-glow",
      ring: "ring-yty-glow",
    },
  },
  {
    id: "valor",
    name: "Valor",
    description: "Your relationship with society",
    icon: YTY_ELEMENT_GRAMMAR.valor.glyph,
    color: {
      accent: "text-yty-valor",
      edge: "border-yty-valor",
      ring: "ring-yty-valor",
    },
  },
  {
    id: "wit",
    name: "Wit",
    description: "Your relationship with technology",
    icon: YTY_ELEMENT_GRAMMAR.wit.glyph,
    color: {
      accent: "text-yty-wit",
      edge: "border-yty-wit",
      ring: "ring-yty-wit",
    },
  },
] as const;

export type YtyElementId = (typeof YTY_ELEMENTS)[number]["id"];
export type YtyElement = (typeof YTY_ELEMENTS)[number];
