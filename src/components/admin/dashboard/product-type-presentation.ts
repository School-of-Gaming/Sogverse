import {
  PRODUCT_KIND_GRAMMAR,
  type GrammarRow,
  type ProductKindId,
  type YtyFamilyId,
} from "@sog/ui";
import type { LucideIcon } from "lucide-react";
import type { ProductType } from "@/types";

/**
 * **The site-wide product-type signal: an icon and a colour, together.**
 *
 * Neither half is decided here. A product kind is a fact, and a fact takes a
 * Yty family: the mapping from kind to family *and* to glyph is the first row
 * of SOG-UI's tone grammar (`PRODUCT_KIND_GRAMMAR`), in the library's
 * foundations tier, with this module as its consumer. What is left here is the
 * translation of that fact into what an admin surface paints — the family's own
 * utilities — and the message key that names the type in the reader's locale,
 * which is the one half of the signal the library has no word for.
 *
 * **Colour-coding product types is an admin-only operational convenience and is
 * never shown to a family.** That is what lets these hues be the Yty families'
 * own rather than a categorical palette of their own: one-meaning-per-hue holds
 * per surface, an admin table shows no Yty elements, and where an admin does
 * meet both the glyph-and-label rule carries the meaning. The reason each kind
 * takes the family it takes lives with the table in the library.
 *
 * **Icon and colour travel as a pair, everywhere.** Either alone is weaker than
 * both: a colour is fast but needs a key, and a glyph is self-describing but
 * hard to scan in a row of twenty. Tinting the glyph gives one mark that is both
 * — so a chip, a product card, a filter chip, a feed row and the key itself all
 * carry the same tinted glyph, and none of them carries a bare swatch.
 *
 * **Strong and soft follow the library's standing rule**: soft carries text and
 * glyphs, strong carries fills, edges and rings. The tile is the strong variant
 * at chip scale, which is the icon-accent tile the library's alpha ban names as
 * an exemption.
 *
 * **Every class is written out in full.** Tailwind scans source text for
 * complete class names, so a class assembled from a family id at render time
 * compiles to nothing at all — the map below has to hold the literal strings
 * even though that makes it repetitive.
 */
/**
 * The message-catalog name of a product type, under `admin.products.types`.
 *
 * The nouns themselves are **not** redeclared here: the admin product surfaces
 * already carry a translated `label`/`plural` pair per type, and a second copy
 * would be a second place to translate "Municipality club" — free to drift into
 * saying something else on this page than on the page the card links to.
 */
export type ProductTypeMessageKey =
  | "consumerClub"
  | "municipalityClub"
  | "camp"
  | "event";

/** How a Yty family is spent on an admin surface: the glyph's ink, and the tile behind it. */
interface FamilyClasses {
  /** The family's soft variant as a foreground colour — how the glyph is tinted. */
  text: string;
  /** A chip-scale wash of the family's strong variant, for the tile the glyph sits in. */
  tint: string;
}

/** The four families, each as the pair of utilities an admin surface draws it with. */
const FAMILY_CLASSES: Record<YtyFamilyId, FamilyClasses> = {
  harmony: { text: "text-yty-harmony-soft", tint: "bg-yty-harmony-strong/15" },
  glow: { text: "text-yty-glow-soft", tint: "bg-yty-glow-strong/15" },
  valor: { text: "text-yty-valor-soft", tint: "bg-yty-valor-strong/15" },
  wit: { text: "text-yty-wit-soft", tint: "bg-yty-wit-strong/15" },
};

/**
 * The library's table, re-keyed by Sogverse's own enum — and the first half of
 * the check that the two agree.
 *
 * SOG-UI depends on nothing in Sogverse, so it spells the four kinds as a
 * string-literal union of its own rather than importing the generated
 * `product_type`. This annotation is what stops the two drifting: a kind added
 * to the database enum and not to the grammar fails to compile here. The
 * mirror-image direction — a grammar key the enum does not have — is caught by
 * `MESSAGE_KEYS` below, which is keyed by the library's union and holds the
 * same four literals `PRODUCT_TYPE_PRESENTATION` is checked against.
 */
const GRAMMAR: Record<ProductType, GrammarRow> = PRODUCT_KIND_GRAMMAR;

/** Which `admin.products.types` entry names each type. Keyed by the library's union — see above. */
const MESSAGE_KEYS: Record<ProductKindId, ProductTypeMessageKey> = {
  consumer_club: "consumerClub",
  municipality_club: "municipalityClub",
  camp: "camp",
  event: "event",
};

export interface ProductTypePresentation extends FamilyClasses {
  /** Which `admin.products.types` entry names this type. */
  i18nKey: ProductTypeMessageKey;
  /** The glyph, from the library's tone grammar. */
  icon: LucideIcon;
}

export const PRODUCT_TYPE_PRESENTATION: Record<
  ProductType,
  ProductTypePresentation
> = {
  consumer_club: {
    i18nKey: MESSAGE_KEYS.consumer_club,
    icon: GRAMMAR.consumer_club.glyph,
    ...FAMILY_CLASSES[GRAMMAR.consumer_club.family],
  },
  municipality_club: {
    i18nKey: MESSAGE_KEYS.municipality_club,
    icon: GRAMMAR.municipality_club.glyph,
    ...FAMILY_CLASSES[GRAMMAR.municipality_club.family],
  },
  camp: {
    i18nKey: MESSAGE_KEYS.camp,
    icon: GRAMMAR.camp.glyph,
    ...FAMILY_CLASSES[GRAMMAR.camp.family],
  },
  event: {
    i18nKey: MESSAGE_KEYS.event,
    icon: GRAMMAR.event.glyph,
    ...FAMILY_CLASSES[GRAMMAR.event.family],
  },
};

/** The order the key, the filter chips and the cohort sort all use. */
export const PRODUCT_TYPE_ORDER: readonly ProductType[] = [
  "consumer_club",
  "municipality_club",
  "camp",
  "event",
];
