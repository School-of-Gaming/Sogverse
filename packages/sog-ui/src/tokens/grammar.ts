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
 * **This is why the icon set is a library dependency.** `lucide-react` is a peer
 * dependency from this module onward, and the four glyphs below are the first
 * icons SOG-UI owns. They arrive with their consumer rather than ahead of it: an
 * icon vocabulary proper — every mark the brand uses, named and ruled — is a
 * later project, and nothing is defined here before something spends it.
 *
 * Strong and soft follow the standing rule wherever a row is spent: **soft
 * carries text and glyphs, strong carries fills, edges and rings.**
 */

import {
  CalendarDays,
  Joystick,
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
 */
export const PRODUCT_KIND_GRAMMAR = {
  /**
   * The relationship with people: the community a family chooses for itself,
   * week after week.
   */
  consumer_club: { family: "harmony", glyph: Joystick },
  /**
   * The relationship with technology and learning: the school-hours offering,
   * bought by a municipality.
   */
  municipality_club: { family: "wit", glyph: School },
  /**
   * The brand's own content coding already puts challenges, camps and courage
   * under Valor, so this row is not a new decision — it is the existing one
   * applied.
   */
  camp: { family: "valor", glyph: Tent },
  /** Growth and milestones: the one-off occasion. */
  event: { family: "glow", glyph: CalendarDays },
} as const satisfies Record<ProductKindId, GrammarRow>;
