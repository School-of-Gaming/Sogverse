import { describe, it, expect } from "vitest";
import { filterProducts } from "@/components/public/products-v2/filter-products";
import type { ProductV2BrowseRow } from "@/types";

// Minimal row factory — only the fields filterProducts() looks at need
// real values. Everything else is filled with a placeholder cast.
function row(overrides: {
  id: string;
  topicSlug: string | null;
  tagSlugs: string[];
}): ProductV2BrowseRow {
  return {
    id: overrides.id,
    topics_v2: overrides.topicSlug
      ? {
          slug: overrides.topicSlug,
          kind: "game",
          icon_path: null,
          topic_translations_v2: [],
        }
      : null,
    product_tags_v2: overrides.tagSlugs.map((s) => ({
      tags_v2: { slug: s, tag_translations_v2: [] },
    })),
    product_translations_v2: [],
    product_prices_v2: [],
    schedule_slots_v2: [],
  } as unknown as ProductV2BrowseRow;
}

const A = row({ id: "a", topicSlug: "minecraft", tagSlugs: ["beginner"] });
const B = row({
  id: "b",
  topicSlug: "fortnite",
  tagSlugs: ["competitive", "neurodiversity-friendly"],
});
const C = row({ id: "c", topicSlug: "pokemon-go", tagSlugs: [] });
const NO_TOPIC = row({ id: "d", topicSlug: null, tagSlugs: ["beginner"] });

const ALL = [A, B, C, NO_TOPIC];

describe("filterProducts", () => {
  it("returns everything when filters are empty", () => {
    expect(filterProducts(ALL, { topics: [], tags: [] })).toEqual(ALL);
  });

  it("matches a single topic slug", () => {
    expect(
      filterProducts(ALL, { topics: ["minecraft"], tags: [] }).map((p) => p.id),
    ).toEqual(["a"]);
  });

  it("OR-combines topic slugs", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft", "fortnite"],
      tags: [],
    }).map((p) => p.id);
    expect(ids).toEqual(["a", "b"]);
  });

  it("excludes products without a topic when a topic filter is set", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft"],
      tags: [],
    }).map((p) => p.id);
    expect(ids).not.toContain("d");
  });

  it("matches when a product has any of the selected tags", () => {
    expect(
      filterProducts(ALL, {
        topics: [],
        tags: ["competitive"],
      }).map((p) => p.id),
    ).toEqual(["b"]);
  });

  it("OR-combines tag slugs across products", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      tags: ["beginner", "competitive"],
    }).map((p) => p.id);
    // A has beginner, B has competitive, D has beginner. C has neither.
    expect(ids.sort()).toEqual(["a", "b", "d"]);
  });

  it("ANDs topic and tag filters together", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft", "fortnite"],
      tags: ["competitive"],
    }).map((p) => p.id);
    // Only B passes both: topic ∈ set AND has 'competitive'.
    expect(ids).toEqual(["b"]);
  });

  it("returns nothing when no product matches", () => {
    expect(
      filterProducts(ALL, { topics: ["roblox"], tags: [] }),
    ).toEqual([]);
  });
});
