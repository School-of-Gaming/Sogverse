import type { ProductV2BrowseRow } from "@/types";

// Topic + tag filters as the parent navigates the catalog.
//
// - `topics`: list of topic slugs the parent has selected. Topic is
//   single-valued on a product (one `topic_id`), so a product passes when
//   its topic slug is in the selected set. OR semantics across the set
//   (parent picking Minecraft AND Fortnite expects to see both).
// - `tags`: list of tag slugs. A product can have many tags. OR semantics
//   inside the set — the product passes if it has any of the selected
//   tags. (Switching this to AND would be a one-line change once parents
//   start asking for it.)
//
// Filters AND together: a product must pass every active filter.
// Empty filter values are no-ops, so unset filters always pass.

export interface BrowseFilters {
  topics: string[];
  tags: string[];
}

export const EMPTY_FILTERS: BrowseFilters = { topics: [], tags: [] };

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
    return true;
  });
}
