/*
 * ############################################################################
 * ##                                                                        ##
 * ##   /!\  BRAND RULE EXCEPTION  --  THIS PAGE ONLY  --  NOT A PRECEDENT   ##
 * ##                                                                        ##
 * ############################################################################
 *
 * The platform vision page (`/admin/platform-vision`) KNOWINGLY VIOLATES two
 * SOG-UI colour rules (`packages/sog-ui/CLAUDE.md`), BY OWNER RULING:
 *
 *   1. THE COLOUR BUDGET. SOG-UI says no page spends all six hues, and an admin
 *      surface defaults to act plus one. This page spends all six.
 *
 *   2. NUMERALS AND MARKS ON THE YTY FILLS. `onFill` below draws the page
 *      ground (`fill-background`) on the four Yty hues -- a pairing SOG-UI does
 *      not offer. The owner checked its contrast by eye and accepts it here.
 *
 * WHY IT IS ALLOWED: the page is admin only and private, and it is a full
 * celebration of the brand -- the one place staff see the whole world we are
 * building, drawn in every colour it has.
 *
 * CONFINED TO THIS PAGE ALONE. Neither pairing would fly anywhere else, and
 * neither is a precedent for any other surface, admin or not. Do not copy these
 * tones, or the reasoning, into another page.
 *
 * ############################################################################
 *
 * Within the exception the other colour rules still hold: every hue is a
 * library token at its authored value, never an alpha step; colour arrives as
 * an edge, a rule, a mark, a glyph, an element's name beside its glyph, or paint
 * in the artwork; headings and prose stay ink. World is never an ink, so its
 * glyph is the ink and the hue goes on the edge around it. Every class is
 * spelled out so Tailwind sees it.
 */

export type VisionTone = "act" | "world" | "harmony" | "glow" | "valor" | "wit";

interface ToneClasses {
  /** Paint for a shape in the artwork. */
  readonly fill: string;
  /** A line in the artwork. */
  readonly stroke: string;
  /**
   * A numeral or mark drawn on top of `fill`: the ink that hue carries.
   * /!\ BRAND RULE EXCEPTION on the four Yty hues (`fill-background`): see the
   * banner at the top of this file. This page only.
   */
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
