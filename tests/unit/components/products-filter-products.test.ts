import { describe, it, expect } from "vitest";
import { filterProducts } from "@/components/public/products/filter-products";
import type { ProductBrowseRow, ProductTopic } from "@/types";

// Minimal row factory — only the fields filterProducts() looks at need
// real values. Everything else is filled with a placeholder cast.
function row(overrides: {
  id: string;
  topic: ProductTopic;
  isRemote?: boolean;
  spokenLanguageCode?: string;
}): ProductBrowseRow {
  return {
    id: overrides.id,
    is_remote: overrides.isRemote ?? false,
    spoken_language_code: overrides.spokenLanguageCode ?? "en",
    topic: overrides.topic,
    product_translations: [],
    product_prices: [],
    schedule_slots: [],
    locations: null,
  } as unknown as ProductBrowseRow;
}

const A = row({
  id: "a",
  topic: "minecraft",
  isRemote: true,
  spokenLanguageCode: "en",
});
const B = row({
  id: "b",
  topic: "fortnite",
  isRemote: false,
  spokenLanguageCode: "fi",
});
const C = row({
  id: "c",
  topic: "webinar",
  isRemote: true,
  spokenLanguageCode: "fi",
});

const ALL = [A, B, C];

describe("filterProducts", () => {
  it("returns everything when filters are empty", () => {
    expect(
      filterProducts(ALL, { topics: [], format: null, languages: [] }),
    ).toEqual(ALL);
  });

  it("matches a single topic", () => {
    expect(
      filterProducts(ALL, {
        topics: ["minecraft"],
        format: null,
        languages: [],
      }).map((p) => p.id),
    ).toEqual(["a"]);
  });

  it("OR-combines topics", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft", "fortnite"],
      format: null,
      languages: [],
    }).map((p) => p.id);
    expect(ids).toEqual(["a", "b"]);
  });

  it("returns nothing when no product matches", () => {
    // B is the only Fortnite product, but it's in-person.
    expect(
      filterProducts(ALL, {
        topics: ["fortnite"],
        format: "online",
        languages: [],
      }),
    ).toEqual([]);
  });

  it("format=online keeps only remote products", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: "online",
      languages: [],
    }).map((p) => p.id);
    // A and C are remote.
    expect(ids.sort()).toEqual(["a", "c"]);
  });

  it("format=in_person keeps only in-person products", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: "in_person",
      languages: [],
    }).map((p) => p.id);
    expect(ids).toEqual(["b"]);
  });

  it("ANDs format with topic filters", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft", "fortnite"],
      format: "online",
      languages: [],
    }).map((p) => p.id);
    // A passes topic and is online; B passes topic but is in-person.
    expect(ids).toEqual(["a"]);
  });

  it("matches a single spoken-language code", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: null,
      languages: ["fi"],
    }).map((p) => p.id);
    // B and C are Finnish.
    expect(ids.sort()).toEqual(["b", "c"]);
  });

  it("OR-combines language codes", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: null,
      languages: ["en", "fi"],
    }).map((p) => p.id);
    expect(ids.sort()).toEqual(["a", "b", "c"]);
  });

  it("ANDs language with topic and format filters", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft", "fortnite"],
      format: null,
      languages: ["en"],
    }).map((p) => p.id);
    // A is minecraft + en; B is fortnite but fi.
    expect(ids).toEqual(["a"]);
  });
});
