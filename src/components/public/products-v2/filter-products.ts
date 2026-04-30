import type { ProductV2BrowseRow } from "@/types";

// Topic + tag + format filters as the parent navigates the catalog.
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
//   `products_v2.is_remote`. Null means "no preference" and skips the
//   filter. Single-valued — a product is one or the other, never both.
//
// Filters AND together: a product must pass every active filter.
// Empty filter values are no-ops, so unset filters always pass.
//
// Slug invariant: incoming topic/tag values are pre-lowercased by
// `use-browse-filters.ts`, and topic/tag slugs are written lowercase by
// `slugify()` in their create routes.

export type ProductFormat = "online" | "in_person";

export interface BrowseFilters {
  topics: string[];
  tags: string[];
  format: ProductFormat | null;
}

export const EMPTY_FILTERS: BrowseFilters = {
  topics: [],
  tags: [],
  format: null,
};

export function filterProducts(
  products: readonly ProductV2BrowseRow[],
  filters: BrowseFilters,
): ProductV2BrowseRow[] {
  return products.filter((p) => {
    if (filters.topics.length > 0) {
      const slug = p.topics_v2?.slug;
      if (!slug || !filters.topics.includes(slug)) return false;
    }
    if (filters.tags.length > 0) {
      const productTagSlugs = new Set(
        p.product_tags_v2
          .map((pt) => pt.tags_v2?.slug)
          .filter((s): s is string => Boolean(s)),
      );
      if (!filters.tags.some((t) => productTagSlugs.has(t))) return false;
    }
    if (filters.format !== null) {
      const isOnline = p.is_remote;
      if (filters.format === "online" && !isOnline) return false;
      if (filters.format === "in_person" && isOnline) return false;
    }
    return true;
  });
}
