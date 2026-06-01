import { describe, it, expect } from "vitest";
import { filterProducts } from "@/components/public/products/filter-products";
import type { ProductBrowseRow } from "@/types";

// Minimal row factory — only the fields filterProducts() looks at need
// real values. Everything else is filled with a placeholder cast.
function row(overrides: {
  id: string;
  topicSlug: string | null;
  tagSlugs: string[];
  isRemote?: boolean;
  spokenLanguageCode?: string;
}): ProductBrowseRow {
  return {
    id: overrides.id,
    is_remote: overrides.isRemote ?? false,
    spoken_language_code: overrides.spokenLanguageCode ?? "en",
    topics: overrides.topicSlug
      ? {
          slug: overrides.topicSlug,
          kind: "game",
          icon_path: null,
          topic_translations: [],
        }
      : null,
    product_tags: overrides.tagSlugs.map((s) => ({
      tags: { slug: s, tag_translations: [] },
    })),
    product_translations: [],
    product_prices: [],
    schedule_slots: [],
    locations: null,
  } as unknown as ProductBrowseRow;
}

const A = row({
  id: "a",
  topicSlug: "minecraft",
  tagSlugs: ["beginner"],
  isRemote: true,
  spokenLanguageCode: "en",
});
const B = row({
  id: "b",
  topicSlug: "fortnite",
  tagSlugs: ["competitive", "neurodiversity-friendly"],
  isRemote: false,
  spokenLanguageCode: "fi",
});
const C = row({
  id: "c",
  topicSlug: "pokemon-go",
  tagSlugs: [],
  isRemote: true,
  spokenLanguageCode: "fi",
});
const NO_TOPIC = row({
  id: "d",
  topicSlug: null,
  tagSlugs: ["beginner"],
  isRemote: false,
  spokenLanguageCode: "sv",
});

const ALL = [A, B, C, NO_TOPIC];

describe("filterProducts", () => {
  it("returns everything when filters are empty", () => {
    expect(
      filterProducts(ALL, { topics: [], tags: [], format: null, languages: [] }),
    ).toEqual(ALL);
  });

  it("matches a single topic slug", () => {
    expect(
      filterProducts(ALL, {
        topics: ["minecraft"],
        tags: [],
        format: null,
        languages: [],
      }).map((p) => p.id),
    ).toEqual(["a"]);
  });

  it("OR-combines topic slugs", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft", "fortnite"],
      tags: [],
      format: null,
      languages: [],
    }).map((p) => p.id);
    expect(ids).toEqual(["a", "b"]);
  });

  it("excludes products without a topic when a topic filter is set", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft"],
      tags: [],
      format: null,
      languages: [],
    }).map((p) => p.id);
    expect(ids).not.toContain("d");
  });

  it("matches when a product has any of the selected tags", () => {
    expect(
      filterProducts(ALL, {
        topics: [],
        tags: ["competitive"],
        format: null,
        languages: [],
      }).map((p) => p.id),
    ).toEqual(["b"]);
  });

  it("OR-combines tag slugs across products", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      tags: ["beginner", "competitive"],
      format: null,
      languages: [],
    }).map((p) => p.id);
    // A has beginner, B has competitive, D has beginner. C has neither.
    expect(ids.sort()).toEqual(["a", "b", "d"]);
  });

  it("ANDs topic and tag filters together", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft", "fortnite"],
      tags: ["competitive"],
      format: null,
      languages: [],
    }).map((p) => p.id);
    // Only B passes both: topic ∈ set AND has 'competitive'.
    expect(ids).toEqual(["b"]);
  });

  it("returns nothing when no product matches", () => {
    expect(
      filterProducts(ALL, {
        topics: ["roblox"],
        tags: [],
        format: null,
        languages: [],
      }),
    ).toEqual([]);
  });

  it("format=online keeps only remote products", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      tags: [],
      format: "online",
      languages: [],
    }).map((p) => p.id);
    // A and C are remote.
    expect(ids.sort()).toEqual(["a", "c"]);
  });

  it("format=in_person keeps only in-person products", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      tags: [],
      format: "in_person",
      languages: [],
    }).map((p) => p.id);
    // B and D are in-person.
    expect(ids.sort()).toEqual(["b", "d"]);
  });

  it("ANDs format with topic and tag filters", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft", "fortnite"],
      tags: ["beginner", "competitive"],
      format: "online",
      languages: [],
    }).map((p) => p.id);
    // A passes topic+tag and is online; B passes but is in-person.
    expect(ids).toEqual(["a"]);
  });

  it("matches a single spoken-language code", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      tags: [],
      format: null,
      languages: ["fi"],
    }).map((p) => p.id);
    // B and C are Finnish.
    expect(ids.sort()).toEqual(["b", "c"]);
  });

  it("OR-combines language codes", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      tags: [],
      format: null,
      languages: ["fi", "sv"],
    }).map((p) => p.id);
    // B, C are fi; D is sv.
    expect(ids.sort()).toEqual(["b", "c", "d"]);
  });

  it("ANDs language with topic / tag / format filters", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft", "fortnite"],
      tags: [],
      format: null,
      languages: ["en"],
    }).map((p) => p.id);
    // A is minecraft + en; B is fortnite but fi.
    expect(ids).toEqual(["a"]);
  });
});
