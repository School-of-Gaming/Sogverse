/**
 * The tone grammar: which fact takes which family, and which glyph rides with it.
 *
 * Each colour family carries one meaning, and a component takes the **fact** —
 * a product kind, a role, a status — never the tone. This module is where that
 * mapping is decided, so a consumer passes `kind="camp"` and cannot choose a
 * colour. That is the whole mechanism behind one-meaning-per-hue: a hue cannot
 * drift into a second meaning if no surface is able to pick one.
 *
 * **Colour and glyph are one fact, decided together.** Meaning never travels by
 * hue alone — a colour-coded element carries a glyph and a label beside it,
 * because a meaningful share of gamers are colourblind and a cue they cannot see
 * is a cue that is not there. So a grammar row holds both halves. Deciding the
 * family here and the glyph in the consumer would split one fact across two
 * files, and the two would drift the first time either was edited alone.
 *
 * **This is why the icon set is a library dependency.** `lucide-react` is a
 * dependency of the library itself from this module onward, pinned to the
 * release the library chooses rather than borrowed from whatever the consumer
 * happens to install: the glyphs below are part of the grammar, so the version
 * they come from is the library's decision. The rows here are the first icons
 * SOG-UI owns. They arrive with their consumer rather than ahead of it: an icon
 * vocabulary proper — every mark the brand uses, named and ruled — is a later
 * project, and nothing is defined here before something spends it.
 *
 * **A family is one colour**, so a row decides a meaning and never a variant:
 * whatever construct a row is spent in — a tinted glyph, a chip, an edge, a
 * label — takes the family's single hex from `brand.ts`.
 *
 * **The status rows are not here, and that is on purpose.** A status is a fact
 * that takes a family too — success is Glow, info is Wit — but only two of the
 * four are: destructive and warning are hues in their own right. Splitting one
 * four-row table so that half of it sat in the colour source and half here would
 * put two rows in each file, so the whole of it lives in `brand.ts` as `STATUS`,
 * beside the hues the other two rows carry. Read that table as a third one of
 * these, with its own doc comment saying why each row is the kind of row it is.
 */

import {
  Brain,
  Gamepad2,
  Handshake,
  Heart,
  Lighthouse,
  PartyPopper,
  School,
  Tent,
  type LucideIcon,
} from "lucide-react";

import type { YtyFamilyId } from "./brand";

/**
 * The four kinds of thing School of Gaming sells.
 *
 * Spelled here as a string-literal union rather than imported from a consumer's
 * schema: the library depends on nothing in Sogverse, so the names travel as
 * literals and the consumer proves the two agree at compile time.
 */
export type ProductKindId =
  | "consumer_club"
  | "municipality_club"
  | "camp"
  | "event";

/** One fact's tone: the family that carries its meaning, and the mark that carries it too. */
export interface GrammarRow {
  readonly family: YtyFamilyId;
  readonly glyph: LucideIcon;
}

/**
 * Product kind → Yty family and glyph.
 *
 * **Colour-coding product kinds is an admin-only operational convenience and is
 * never shown to a family.** That is what lets these hues be the Yty families'
 * own rather than a fifth categorical palette: one-meaning-per-hue holds per
 * surface, an admin table shows no Yty elements at all, and where an admin does
 * meet both — the voice page's Yty zones — the glyph-and-label rule is what
 * carries the meaning. A parent or a gamer never sees a product coloured by its
 * kind, so no reader is ever asked to hold two meanings for one hue at once.
 *
 * The glyphs are the marks an admin already navigates by, which is why the key
 * these rows draw teaches something that transfers rather than something local
 * to one page.
 *
 * **Each row is matched on the element's own meaning**, the relationship it
 * names, and not on any looser colour-coding of content. The two clubs are what
 * an admin meets all day, so those two rows are the ones that have to be right
 * and to be told apart at a glance; camps and events are rare by comparison,
 * and the last row falls to the family that remains once the others are placed,
 * which is stated rather than dressed up as a fit.
 */
export const PRODUCT_KIND_GRAMMAR = {
  /**
   * Glow is the relationship with others: belonging, friendship, the people a
   * gamer plays beside. A consumer club is exactly that, a community a family
   * chooses for itself, week after week.
   */
  consumer_club: { family: "glow", glyph: Gamepad2 },
  /**
   * Wit is the relationship with technology, and the learning that goes with
   * it. A municipality club is the school-hours offering, bought by a
   * municipality for its pupils.
   */
  municipality_club: { family: "wit", glyph: School },
  /**
   * Valor is the relationship with society: trying the hard thing, courage,
   * working with people you did not choose. A camp is the intensive, and it is
   * where a gamer is stretched.
   */
  camp: { family: "valor", glyph: Tent },
  /**
   * Harmony is the relationship with yourself, and no product kind is about
   * that. An event takes it by elimination: it is the one-off occasion, the
   * rarest kind, and the one family left.
   */
  event: { family: "harmony", glyph: PartyPopper },
} as const satisfies Record<ProductKindId, GrammarRow>;

/**
 * The mark a Yty element carries.
 *
 * The kind rows above hold a family and a glyph because a product kind is a
 * fact that has to be *given* a tone. An element is not: it **is** its family,
 * so the family half of the row is the key, and what is left to decide is the
 * mark. That keeps one idea across both tables — a fact takes a family and a
 * glyph — without writing `harmony: { family: "harmony" }`, which is a line
 * that can only ever be wrong.
 */
export interface ElementGlyphRow {
  readonly glyph: LucideIcon;
}

/**
 * Yty element → glyph.
 *
 * Each element names a relationship, and the mark is chosen on that
 * relationship rather than on anything the element is coloured or ranked by.
 * The four are drawn together as often as they are drawn apart — the About
 * cards, the voice room's zones — so they also have to read as one set at a
 * glance and never be mistaken for one another.
 */
export const YTY_ELEMENT_GRAMMAR = {
  /**
   * Harmony is the relationship with yourself: balance, rest, knowing when to
   * stop. A heart is what a reader already reads as feeling turned inward.
   */
  harmony: { glyph: Heart },
  /**
   * Glow is the relationship with others: noticing when someone needs help,
   * asking for it, being generous with credit. A lighthouse is a warm light
   * put out for other people to steer by, which is the behaviour rather than
   * the mood.
   */
  glow: { glyph: Lighthouse },
  /**
   * Valor is the relationship with society: working with people you did not
   * choose, speaking up, trying the hard thing. A handshake is that agreement
   * between strangers; a weapon carries the courage and none of the teamwork.
   */
  valor: { glyph: Handshake },
  /**
   * Wit is the relationship with technology: curiosity and thinking a problem
   * through. A brain says thinking with nothing else attached to it.
   */
  wit: { glyph: Brain },
} as const satisfies Record<YtyFamilyId, ElementGlyphRow>;
