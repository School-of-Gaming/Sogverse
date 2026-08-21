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
 * **The four colours are the palette's own, named for the concept** — the
 * `--product-*` tokens in `globals.css` — rather than drawn from a
 * general-purpose ramp. A ramp promises nothing about what its entries mean, so
 * an entry picked for one slot of it is free to hold the same value as a state
 * colour, and a categorical colour a reader can mistake for a state colour is
 * worse than no colour at all: they have to check which of the two they are
 * looking at every time. A chart that later wants a ramp declares its own for
 * the same reason — an unnamed palette sitting in the stylesheet is one nobody
 * can tell they are misusing.
 *
 * **The hues clear what admin surfaces actually spend.** Destructive, primary
 * and warning, and success are used heavily across `admin/` and are cleared by
 * 25–30°; info appears four times in the whole of it and is treated as cheap
 * ground to sit beside. Saturation and lightness are tuned per hue for roughly
 * equal apparent brightness on the dark background rather than being
 * numerically equal — the hues that are dark by nature carry more of both — so
 * no one type's glyph reads fainter than the rest at a glance.
 *
 * **Only the ordering is a choice.** The two *club* types take the pair
 * furthest apart, because they are the two that co-occur most in a dense week
 * row and are therefore the pair it matters most to tell apart at a glance.
 *
 * **Every class is written out in full.** Tailwind scans source text for
 * complete class names, so a template-built `bg-product-${type}` compiles to
 * nothing at all — the map has to hold the literal strings even though that
 * makes it repetitive.
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
    text: "text-product-consumer-club",
    tint: "bg-product-consumer-club/15",
  },
  municipality_club: {
    i18nKey: "municipalityClub",
    icon: School,
    text: "text-product-municipality-club",
    tint: "bg-product-municipality-club/15",
  },
  camp: {
    i18nKey: "camp",
    icon: Tent,
    text: "text-product-camp",
    tint: "bg-product-camp/15",
  },
  event: {
    i18nKey: "event",
    icon: CalendarDays,
    text: "text-product-event",
    tint: "bg-product-event/15",
  },
};

/** The order the key, the filter chips and the cohort sort all use. */
export const PRODUCT_TYPE_ORDER: readonly ProductType[] = [
  "consumer_club",
  "municipality_club",
  "camp",
  "event",
];
