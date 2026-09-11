import type { AgeBand } from "@/lib/constants/gamer-age";
import type { SpokenLanguageCode } from "@/lib/constants/spoken-languages";
import type { ProductBrowseRow } from "@/types";
import {
  matchesAudienceFilter,
  type AudienceFilterValue,
} from "@/lib/products/product-audience";
import type { ProductTag } from "./product-tag";
import { resolveProductPrice, statesAPrice } from "./format-product-price";
import { DEFAULT_CURRENCY } from "@/lib/constants/currency";

// The currency every browse card prices in, and so the one the price chips
// answer for. Read from the same constant the card reads, so a shop that one
// day prices per viewer changes in one place rather than two.
const BROWSE_CURRENCY = DEFAULT_CURRENCY;

// Topic + format + language filters as the parent navigates the catalog.
//
// - `topics`: list of topic enum values the parent has selected. Topic is
//   single-valued on a product (the `topic` enum column), so a product
//   passes when its topic is in the selected set. OR semantics across the
//   set (parent picking Minecraft AND Fortnite expects to see both).
// - `format`: "online" / "in_person" / null. Maps directly to
//   `products.is_remote`. Null means "no preference" and skips the
//   filter. Single-valued — a product is one or the other, never both.
// - `price`: "free" / "paid" / null. Single-valued like format, and read off
//   the very line the card prints in its footer rather than from pricing rules
//   restated here: "free" is the line that says Free, "paid" is a line that
//   states an amount above nothing. A product billed off-platform prints no
//   price line at all — its card shows how full it is instead — so it answers
//   neither chip and is reachable only with the row cleared. Null skips the
//   filter.
// - `languages`: list of `spoken_language` enum values. Single-valued on a
//   product (`spoken_language_code`, the same enum) — a product passes when its
//   language is in the selected set. OR semantics across the set.
// - `audiences`: list of audience values (`parents`, `families`) the parent
//   has selected. A chip is the badge: each matches exactly the products
//   wearing that label (`parents` = parents-only, `families` = the both-flags
//   shape), so a mixed product answers the Families chip and only that one,
//   and gamers-only — badged with nothing — answers neither; clearing the row
//   is the only way back to everything. OR semantics across the set, and an
//   empty set skips the filter. It is the tool for "shopping for me"; the age
//   band below is the tool for "shopping for a child of age X", which is why
//   the two never fold into one row.
// - `tags`: list of design-tag values the parent has selected. A chip is the
//   chip the card wears: each matches exactly the products carrying that tag,
//   with OR semantics across the set, and an untagged product — the ordinary
//   state, wearing nothing — answers only an empty row. So the row behaves like
//   the audience one and unlike topic or language: lighting every chip is
//   *narrower* than lighting none, and clearing the row is the only way back to
//   the untagged majority.
// - `age`: a selected age band ({min, max}), or null. A product passes when its
//   [min_age, max_age] *overlaps* the band — i.e. it serves some age the band
//   covers. Null means "any age" and skips the filter. The offered bands come
//   from `PRODUCT_AGE_BANDS` in `@/lib/constants/gamer-age` (see
//   `product-browse-filters.tsx`).
// - `days`: list of weekdays (0=Mon..6=Sun, matching `schedule_slots.weekday`)
//   the schedule must touch. A product passes when any of its `schedule_slots`
//   falls on a selected day. OR semantics across the set (a parent picking Mon
//   AND Wed expects to see either). Empty means "any day". It applies to every
//   product type: a club's recurring slot, a camp's day and an event's date all
//   carry a weekday, and "which days of the week is my child busy" is the same
//   question in all three cases. A product with no slots at all (schedule TBD)
//   therefore drops out of any day selection.
//
// Filters AND together: a product must pass every active filter.
// Empty filter values are no-ops, so unset filters always pass.
//
// Lowercase invariant: incoming topic values are pre-lowercased by
// `use-browse-filters.ts` and the product_topic enum values are already
// lowercase. Languages need no such care — both sides are the same generated
// enum, so the comparison is between two members of one literal union.

export type ProductFormat = "online" | "in_person";
export type ProductPriceFilter = "free" | "paid";

/**
 * Whether a product answers the Free or the Paid chip — or neither.
 *
 * Everything about pricing comes from the card's own price resolution, so a
 * chip cannot come to a different conclusion than the footer the reader is
 * looking at. Two shapes answer neither chip and are reachable only with the
 * row cleared: a product billed off-platform, which states no price anywhere,
 * and a paid product with no row in the currency the grid prices in, whose
 * card says as much.
 *
 * A stated amount of nothing is the third: it is a paid product an admin
 * priced at zero, which the schema permits and which the card prints as a
 * zero. "Paid" means a price above nothing, so such a product answers neither
 * chip — it is a mis-authored product rather than a shape the shop offers, and
 * the free chip belongs to the products the billing model itself calls free.
 */
function priceKindOf(p: ProductBrowseRow): ProductPriceFilter | null {
  if (!statesAPrice(p)) return null;
  const resolved = resolveProductPrice({
    prices: p.product_prices,
    billingMode: p.billing_mode,
    productType: p.product_type,
    currency: BROWSE_CURRENCY,
  });
  if (resolved.kind === "free") return "free";
  if (resolved.kind === "unavailable") return null;
  return resolved.priceCents > 0 ? "paid" : null;
}

export interface BrowseFilters {
  topics: string[];
  format: ProductFormat | null;
  price: ProductPriceFilter | null;
  languages: SpokenLanguageCode[];
  audiences: AudienceFilterValue[];
  tags: ProductTag[];
  age: AgeBand | null;
  days: number[];
}

export const EMPTY_FILTERS: BrowseFilters = {
  topics: [],
  format: null,
  price: null,
  languages: [],
  audiences: [],
  tags: [],
  age: null,
  days: [],
};

export function filterProducts(
  products: readonly ProductBrowseRow[],
  filters: BrowseFilters,
): ProductBrowseRow[] {
  return products.filter((p) => {
    if (filters.topics.length > 0) {
      if (!filters.topics.includes(p.topic)) return false;
    }
    if (filters.format !== null) {
      const isOnline = p.is_remote;
      if (filters.format === "online" && !isOnline) return false;
      if (filters.format === "in_person" && isOnline) return false;
    }
    if (filters.price !== null) {
      if (priceKindOf(p) !== filters.price) return false;
    }
    if (filters.languages.length > 0) {
      if (!filters.languages.includes(p.spoken_language_code)) return false;
    }
    if (!matchesAudienceFilter(p, filters.audiences)) return false;
    if (filters.tags.length > 0) {
      // An untagged product carries no chip, so no chip carries it: the null
      // test is the whole of "untagged answers only an empty row", and the
      // membership test is chip-equals-tag with nothing between them.
      if (p.tag === null || !filters.tags.includes(p.tag)) return false;
    }
    if (filters.age !== null) {
      // A band expresses "I am shopping for a child of this age", so a product
      // with no age range at all — one with no gamer audience — is not a near
      // miss, it is a different question. It drops out by construction rather
      // than by a rule of its own.
      if (p.min_age === null || p.max_age === null) return false;
      // Overlap: the product's [min_age, max_age] and the selected band share
      // at least one age.
      if (p.min_age > filters.age.max || p.max_age < filters.age.min) {
        return false;
      }
    }
    if (filters.days.length > 0) {
      if (!p.schedule_slots.some((s) => filters.days.includes(s.weekday))) {
        return false;
      }
    }
    return true;
  });
}
