/**
 * The colours the platform vision page draws in, one row per hue, every class
 * spelled out so Tailwind sees it.
 *
 * **Declared departure: this page spends the whole palette.** SOG-UI's budget
 * gives an admin page act plus one, and keeps the full palette for gamer
 * surfaces, the pages inside the world. This page is an inside-the-world page:
 * it exists to show staff the world we are building, the loop, the four
 * elements, the avatar that grows, so it spends the gamer budget, and all six
 * hues appear on it. Nothing else about the colour rules moves. Every hue is a
 * library token at its authored value, never at an alpha step; colour arrives
 * as an edge, a rule, a mark, a glyph, an element's name beside its glyph, or
 * paint inside the artwork; headings and prose stay ink. World is never an ink,
 * so its glyph is the ink and the hue goes on the edge around it.
 *
 * The departure is confined to `/admin/platform-vision` and is not a precedent
 * for any other admin surface, which keeps the act-plus-one default.
 */

export type VisionTone = "act" | "world" | "harmony" | "glow" | "valor" | "wit";

interface ToneClasses {
  /** Paint for a shape in the artwork. */
  readonly fill: string;
  /** A line in the artwork. */
  readonly stroke: string;
  /** A numeral or mark drawn on top of `fill`: the ink that hue carries. */
  readonly onFill: string;
  /** A glyph in a tile edged in this hue. World is never an ink, so its glyph is the page ink. */
  readonly glyph: string;
  /** The edge all round, for a glyph tile or a boxed callout. */
  readonly edge: string;
  /** A card's top edge, paired with `border-t-4`. */
  readonly edgeTop: string;
  /** A card's leading edge, paired with `border-l-4`. */
  readonly edgeLeft: string;
  /** A rule, a dot or a pin: a small solid mark, never a ground under text. */
  readonly mark: string;
}

export const VISION_TONES = {
  act: {
    fill: "fill-act",
    stroke: "stroke-act",
    onFill: "fill-act-foreground",
    glyph: "text-act",
    edge: "border-act",
    edgeTop: "border-t-act",
    edgeLeft: "border-l-act",
    mark: "bg-act",
  },
  world: {
    fill: "fill-world",
    stroke: "stroke-world",
    onFill: "fill-world-foreground",
    glyph: "text-foreground",
    edge: "border-world",
    edgeTop: "border-t-world",
    edgeLeft: "border-l-world",
    mark: "bg-world",
  },
  harmony: {
    fill: "fill-yty-harmony",
    stroke: "stroke-yty-harmony",
    onFill: "fill-background",
    glyph: "text-yty-harmony",
    edge: "border-yty-harmony",
    edgeTop: "border-t-yty-harmony",
    edgeLeft: "border-l-yty-harmony",
    mark: "bg-yty-harmony",
  },
  glow: {
    fill: "fill-yty-glow",
    stroke: "stroke-yty-glow",
    onFill: "fill-background",
    glyph: "text-yty-glow",
    edge: "border-yty-glow",
    edgeTop: "border-t-yty-glow",
    edgeLeft: "border-l-yty-glow",
    mark: "bg-yty-glow",
  },
  valor: {
    fill: "fill-yty-valor",
    stroke: "stroke-yty-valor",
    onFill: "fill-background",
    glyph: "text-yty-valor",
    edge: "border-yty-valor",
    edgeTop: "border-t-yty-valor",
    edgeLeft: "border-l-yty-valor",
    mark: "bg-yty-valor",
  },
  wit: {
    fill: "fill-yty-wit",
    stroke: "stroke-yty-wit",
    onFill: "fill-background",
    glyph: "text-yty-wit",
    edge: "border-yty-wit",
    edgeTop: "border-t-yty-wit",
    edgeLeft: "border-l-yty-wit",
    mark: "bg-yty-wit",
  },
} as const satisfies Record<VisionTone, ToneClasses>;
