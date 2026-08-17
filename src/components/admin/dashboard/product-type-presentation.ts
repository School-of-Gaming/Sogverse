import {
  CalendarDays,
  Joystick,
  School,
  Tent,
  type LucideIcon,
} from "lucide-react";
import type { ProductType } from "@/types";

/**
 * **The site-wide product-type signal: an icon and a colour, together.**
 *
 * This map is the single place either half is decided, and it is deliberately
 * more than a dashboard detail — it establishes the convention. A surface that
 * later needs to say "this is a camp" inherits *both* halves from here rather
 * than picking a colour of its own; a second mapping would mean the same green
 * meaning camps on one page and something else on the next, which is precisely
 * the failure a categorical palette exists to prevent.
 *
 * **The icons are not new.** The admin sidebar already taught this grammar —
 * Joystick for consumer clubs, School for municipality clubs, Tent for camps,
 * CalendarDays for events — and an admin has been navigating by those glyphs
 * since before this page existed. Reusing them means the dashboard is legible
 * with no legend at all to anyone who has clicked the sidebar once, and it means
 * the key on this page teaches something that transfers rather than something
 * local to it.
 *
 * **Icon and colour travel as a pair, everywhere.** Either alone is weaker than
 * both: a colour is fast but needs a key, and a glyph is self-describing but
 * hard to scan in a row of twenty. Tinting the glyph gives one mark that is both
 * — so a chip, a product card, a filter chip, a feed row and the key itself all
 * carry the same tinted glyph, and none of them carries a bare swatch.
 *
 * **`chart-1` is deliberately unused.** It is `42 98% 49%` — the same hue as
 * `--primary` and two degrees off `--warning` (`45 93% 47%`) — so a type accent
 * painted with it sat a few pixels from the warning-amber attention dot on the
 * very same chip. A categorical colour that can be mistaken for a state colour
 * is worse than no colour at all, because the reader has to check which of the
 * two they are looking at every time. Excluding it leaves exactly four tokens
 * for four types, so the assignment below is forced in its membership and only
 * its ordering is a choice: violet, blue, green, pink, none within sixty degrees
 * of amber. The two *club* types take the pair furthest apart, because they are
 * the two that co-occur most in a dense week row and are therefore the pair it
 * matters most to tell apart at a glance.
 *
 * **Every class is written out in full.** Tailwind scans source text for
 * complete class names, so a template-built `bg-chart-${n}` compiles to nothing
 * at all — the map has to hold the literal strings even though that makes it
 * repetitive.
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

export interface ProductTypePresentation {
  /** Which `admin.products.types` entry names this type. */
  i18nKey: ProductTypeMessageKey;
  /** The glyph, borrowed from the admin sidebar's existing nav grammar. */
  icon: LucideIcon;
  /** The hue as a foreground colour — how the glyph is tinted. */
  text: string;
  /** A wash of the same hue, for the tile the glyph sits in on the key. */
  tint: string;
}

export const PRODUCT_TYPE_PRESENTATION: Record<
  ProductType,
  ProductTypePresentation
> = {
  consumer_club: {
    i18nKey: "consumerClub",
    icon: Joystick,
    text: "text-chart-2",
    tint: "bg-chart-2/15",
  },
  municipality_club: {
    i18nKey: "municipalityClub",
    icon: School,
    text: "text-chart-4",
    tint: "bg-chart-4/15",
  },
  camp: {
    i18nKey: "camp",
    icon: Tent,
    text: "text-chart-3",
    tint: "bg-chart-3/15",
  },
  event: {
    i18nKey: "event",
    icon: CalendarDays,
    text: "text-chart-5",
    tint: "bg-chart-5/15",
  },
};

/** The order the key, the filter chips and the cohort sort all use. */
export const PRODUCT_TYPE_ORDER: readonly ProductType[] = [
  "consumer_club",
  "municipality_club",
  "camp",
  "event",
];
