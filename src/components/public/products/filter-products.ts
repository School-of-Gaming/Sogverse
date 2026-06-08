import type { ProductBrowseRow, ProductType } from "@/types";

// Topic + format + language filters as the parent navigates the catalog.
//
// - `topics`: list of topic enum values the parent has selected. Topic is
//   single-valued on a product (the `topic` enum column), so a product
//   passes when its topic is in the selected set. OR semantics across the
//   set (parent picking Minecraft AND Fortnite expects to see both).
// - `format`: "online" / "in_person" / null. Maps directly to
//   `products.is_remote`. Null means "no preference" and skips the
//   filter. Single-valued — a product is one or the other, never both.
// - `languages`: list of spoken-language codes (`fi`, `en`, `sv`).
//   Single-valued on a product (`spoken_language_code`) — a product passes
//   when its language is in the selected set. OR semantics across the set.
// - `age`: a single gamer age, or null. A product passes when the age falls
//   within its [min_age, max_age] band. Null means "any age" and skips the
//   filter. The selectable ages come from the product age band in
//   `@/lib/constants/gamer-age` (see `product-browse-filters.tsx`).
// - `days`: list of weekdays (0=Mon..6=Sun, matching `schedule_slots.weekday`)
//   the recurring schedule must touch. A product passes when any of its
//   `schedule_slots` falls on a selected day. OR semantics across the set
//   (a parent picking Mon AND Wed expects clubs meeting on either). Empty
//   means "any day". This is a Clubs-only filter — the chip row is hidden for
//   Camps and the caller passes `[]` there (see `product-browse-page.tsx`),
//   so camps with weekday slots are never narrowed by it.
//
// Filters AND together: a product must pass every active filter.
// Empty filter values are no-ops, so unset filters always pass.
//
// Lowercase invariant: incoming topic/language values are pre-lowercased by
// `use-browse-filters.ts`; the product_topic enum values are already
// lowercase, as are spoken-language codes in the DB.

export type ProductFormat = "online" | "in_person";

export interface BrowseFilters {
  topics: string[];
  format: ProductFormat | null;
  languages: string[];
  age: number | null;
  days: number[];
}

export const EMPTY_FILTERS: BrowseFilters = {
  topics: [],
  format: null,
  languages: [],
  age: null,
  days: [],
};

// Single source of truth for "does the day-of-week filter apply to this product
// type". Only types with a recurring weekly schedule (clubs) qualify — camps
// run over a date range, so even though their slots carry weekdays the filter
// is neither offered nor applied for them. Both the filter-row visibility
// (`product-browse-filters.tsx`, via the category's product type) and the
// filter application (`product-browse-page.tsx`, via the browse type) gate on
// this, so the two can't drift.
export function productTypeSupportsDayFilter(type: ProductType): boolean {
  return type === "consumer_club" || type === "municipality_club";
}

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
    if (filters.languages.length > 0) {
      if (!filters.languages.includes(p.spoken_language_code.toLowerCase())) {
        return false;
      }
    }
    if (filters.age !== null) {
      if (filters.age < p.min_age || filters.age > p.max_age) return false;
    }
    if (filters.days.length > 0) {
      if (!p.schedule_slots.some((s) => filters.days.includes(s.weekday))) {
        return false;
      }
    }
    return true;
  });
}
