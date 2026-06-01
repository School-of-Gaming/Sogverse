import type { ProductBrowseRow } from "@/types";

// Topic + tag + format + language filters as the parent navigates the catalog.
//
// - `topics`: list of topic slugs the parent has selected. Topic is
//   single-valued on a product (one `topic_id`), so a product passes when
//   its topic slug is in the selected set. OR semantics across the set
//   (parent picking Minecraft AND Fortnite expects to see both).
// - `tags`: list of tag slugs. A product can have many tags. OR semantics
//   inside the set — the product passes if it has any of the selected
//   tags. (Switching this to AND would be a one-line change once parents
//   start asking for it.)
// - `format`: "online" / "in_person" / null. Maps directly to
//   `products.is_remote`. Null means "no preference" and skips the
//   filter. Single-valued — a product is one or the other, never both.
// - `languages`: list of spoken-language codes (`fi`, `en`, `sv`).
//   Single-valued on a product (`spoken_language_code`) — a product passes
//   when its language is in the selected set. OR semantics across the set.
//
// Filters AND together: a product must pass every active filter.
// Empty filter values are no-ops, so unset filters always pass.
//
// Slug invariant: incoming topic/tag/language values are pre-lowercased
// by `use-browse-filters.ts`, and topic/tag slugs are written lowercase
// by `slugify()` in their create routes. Spoken-language codes are
// already lowercase in the DB.

export type ProductFormat = "online" | "in_person";

export interface BrowseFilters {
  topics: string[];
  tags: string[];
  format: ProductFormat | null;
  languages: string[];
}

export const EMPTY_FILTERS: BrowseFilters = {
  topics: [],
  tags: [],
  format: null,
  languages: [],
};

export function filterProducts(
  products: readonly ProductBrowseRow[],
  filters: BrowseFilters,
): ProductBrowseRow[] {
  return products.filter((p) => {
    if (filters.topics.length > 0) {
      const slug = p.topics?.slug;
      if (!slug || !filters.topics.includes(slug)) return false;
    }
    if (filters.tags.length > 0) {
      const productTagSlugs = new Set(
        p.product_tags
          .map((pt) => pt.tags?.slug)
          .filter((s): s is string => Boolean(s)),
      );
      if (!filters.tags.some((t) => productTagSlugs.has(t))) return false;
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
    return true;
  });
}
