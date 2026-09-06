/**
 * The tone grammar: which fact takes which family, and which glyph rides with it.
 *
 * Each colour family carries one meaning, and a component takes the **fact** —
 * a product kind, a role, a status — never the tone. This module is where that
 * mapping is decided, so a consumer passes `kind="camp"` and cannot choose a
 * colour. That is the whole mechanism behind one-meaning-per-hue: a hue cannot
 * drift into a second meaning if no surface is able to pick one.
 *
 * **Where a fact has a glyph, the colour and the glyph are decided together.**
 * Meaning never travels by hue alone — a colour-coded thing carries a label
 * beside it, because a meaningful share of gamers are colourblind and a cue
 * they cannot see is a cue that is not there — and where that label is short
 * enough to want a mark, the mark and the family are one decision. Deciding the
 * family here and the glyph in the consumer would split one fact across two
 * files, and the two would drift the first time either was edited alone.
 *
 * **But not every fact has one, so the glyph slot is per table rather than per
 * fact.** A product kind wears a mark because a kind is met inside a chip, a
 * calendar cell and a rail where the word is often abbreviated away; an element
 * wears one because the four are drawn as a set. A role wears none: its own
 * word is always beside it, so a mark is a third statement of one fact at the
 * size a role chip is read at, and picking four marks that cleared the kinds,
 * the elements and forty zone icons made the set worse rather than clearer. So
 * the role table's row type has no glyph at all, and a glyph is added the day a
 * surface earns one rather than reserved for the day it might.
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

/**
 * The four kinds of person who hold an account.
 *
 * Spelled here as a string-literal union of its own, exactly as `ProductKindId`
 * is and for the same reason: the library depends on nothing in its consumer,
 * so the names travel as literals and the consumer proves the two agree at
 * compile time. `customer` is the identifier a parent's account carries.
 */
export type RoleId = "admin" | "customer" | "gamer" | "gedu";

/**
 * One role's tone: the family that carries it, and nothing else.
 *
 * **No glyph, unlike the two tables above**, and the absence is the decision —
 * see the table below. `family` is nullable where the kind rows' is not, and
 * that null is a decision too.
 */
export interface RoleGrammarRow {
  readonly family: YtyFamilyId | null;
}

/**
 * Role → Yty family.
 *
 * **The families, spent as figures: a neutral chip and the role's word in its
 * family's colour.** A role badge used to be a fill — amber for a gamer, violet
 * for a parent, a blend of the two for a gedu — and a brand colour under a
 * label is the shape this palette is worst at, because every fill it offers is
 * light enough that only a dark label reads on it. On the dark ground the
 * colour is at its most vivid as ink, so the word carries it and the chip's
 * edge stays neutral. The gedu's amber-to-violet gradient goes with this: two
 * brand colours blended into each other is a smear, and it was the only one in
 * the product.
 *
 * **The word alone, and there is no role mark anywhere.** The role's own name
 * is always beside the colour — "Gamer", "Parent" — so the colour reinforces a
 * word that already says everything, which is what the coloured-label rule asks
 * for: remove the colour and nothing is lost. A mark would be a third statement
 * of one fact at the size a role is read at. This row therefore carries no
 * glyph, and a surface that draws a role draws its word and its colour: a
 * dashboard tile, a chip, a table cell. That is a statement about today rather
 * than a ban — if a surface ever earns a role mark, it is decided here, beside
 * the family, and the row gains the field then.
 *
 * **Each row is matched on the element's own meaning.** Glow is the
 * relationship with others, and a gamer is here for the people they play
 * beside. Harmony is the relationship with yourself, which is the balance a
 * parent holds on a child's behalf. Wit is the relationship with technology,
 * which is what a gedu teaches. An admin takes **no family and the quiet ink**:
 * an admin is not a relationship a child has, and leaving Valor unspent says so
 * rather than hiding it behind a fourth colour.
 *
 * **The residual collision is one word, and it is accepted.** These hues are
 * already spent on product kinds, and the four families are the voice room's
 * zone tiles. Two surfaces outside the admin panel badge a role at all — the
 * voice room's participant row and the gedu's group roster — and both badge
 * **the parent and nobody else**, so a family meets exactly one role chip
 * anywhere: "Parent", in Harmony, occasionally near a Harmony zone tile. The
 * glyph-and-label rule is what keeps that survivable: the chip says Parent, the
 * tile says Harmony beside a heart.
 *
 * **The glyphs were tried, in the row, and taken back out.** A dashboard's
 * users strip once keyed one per role, and every candidate had to clear the
 * kind glyphs, the element glyphs and the forty icons a moderator may pick for
 * a zone: a gamepad belongs to the consumer club, a schoolhouse to the
 * municipality club, a shield to gedu certification. What survived that was a
 * set of four picked by elimination, read at 10–12px, where two variants of one
 * person mark are the same smudge. Forcing a mark onto a fact whose word is
 * always present made the fact harder to read, not easier, which is the whole
 * reason the slot is per table now.
 */
export const ROLE_GRAMMAR = {
  /**
   * Glow is the relationship with others, and a gamer's whole reason for being
   * here is the people they play beside.
   */
  gamer: { family: "glow" },
  /**
   * Harmony is the relationship with yourself, which is the balance a parent
   * holds on a child's behalf.
   */
  customer: { family: "harmony" },
  /**
   * Wit is the relationship with technology, which is what a gedu teaches.
   */
  gedu: { family: "wit" },
  /**
   * No family, and the quiet ink. An admin is not a relationship a child has,
   * and leaving Valor unspent says so rather than hiding it behind a fourth
   * colour.
   */
  admin: { family: null },
} as const satisfies Record<RoleId, RoleGrammarRow>;
