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
  minAge?: number;
  maxAge?: number;
}): ProductBrowseRow {
  return {
    id: overrides.id,
    is_remote: overrides.isRemote ?? false,
    spoken_language_code: overrides.spokenLanguageCode ?? "en",
    topic: overrides.topic,
    min_age: overrides.minAge ?? 7,
    max_age: overrides.maxAge ?? 17,
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
  minAge: 7,
  maxAge: 9,
});
const B = row({
  id: "b",
  topic: "fortnite",
  isRemote: false,
  spokenLanguageCode: "fi",
  minAge: 12,
  maxAge: 17,
});
const C = row({
  id: "c",
  topic: "webinar",
  isRemote: true,
  spokenLanguageCode: "fi",
  minAge: 7,
  maxAge: 17,
});

const ALL = [A, B, C];

describe("filterProducts", () => {
  it("returns everything when filters are empty", () => {
    expect(
      filterProducts(ALL, { topics: [], format: null, languages: [], age: null }),
    ).toEqual(ALL);
  });

  it("matches a single topic", () => {
    expect(
      filterProducts(ALL, {
        topics: ["minecraft"],
        format: null,
        languages: [],
        age: null,
      }).map((p) => p.id),
    ).toEqual(["a"]);
  });

  it("OR-combines topics", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft", "fortnite"],
      format: null,
      languages: [],
      age: null,
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
        age: null,
      }),
    ).toEqual([]);
  });

  it("format=online keeps only remote products", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: "online",
      languages: [],
      age: null,
    }).map((p) => p.id);
    // A and C are remote.
    expect(ids.sort()).toEqual(["a", "c"]);
  });

  it("format=in_person keeps only in-person products", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: "in_person",
      languages: [],
      age: null,
    }).map((p) => p.id);
    expect(ids).toEqual(["b"]);
  });

  it("ANDs format with topic filters", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft", "fortnite"],
      format: "online",
      languages: [],
      age: null,
    }).map((p) => p.id);
    // A passes topic and is online; B passes topic but is in-person.
    expect(ids).toEqual(["a"]);
  });

  it("matches a single spoken-language code", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: null,
      languages: ["fi"],
      age: null,
    }).map((p) => p.id);
    // B and C are Finnish.
    expect(ids.sort()).toEqual(["b", "c"]);
  });

  it("OR-combines language codes", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: null,
      languages: ["en", "fi"],
      age: null,
    }).map((p) => p.id);
    expect(ids.sort()).toEqual(["a", "b", "c"]);
  });

  it("ANDs language with topic and format filters", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft", "fortnite"],
      format: null,
      languages: ["en"],
      age: null,
    }).map((p) => p.id);
    // A is minecraft + en; B is fortnite but fi.
    expect(ids).toEqual(["a"]);
  });

  it("age keeps products whose [min_age, max_age] band includes it", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: null,
      languages: [],
      age: 8,
    }).map((p) => p.id);
    // A is 7–9, C is 7–17 (both include 8); B is 12–17.
    expect(ids.sort()).toEqual(["a", "c"]);
  });

  it("age matches at the inclusive band edges", () => {
    const lower = filterProducts(ALL, {
      topics: [],
      format: null,
      languages: [],
      age: 9,
    }).map((p) => p.id);
    // 9 is A's max_age (inclusive) and inside C's band.
    expect(lower.sort()).toEqual(["a", "c"]);

    const upper = filterProducts(ALL, {
      topics: [],
      format: null,
      languages: [],
      age: 12,
    }).map((p) => p.id);
    // 12 is B's min_age (inclusive) and inside C's band; A tops out at 9.
    expect(upper.sort()).toEqual(["b", "c"]);
  });

  it("ANDs age with other filters", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: "online",
      languages: [],
      age: 15,
    }).map((p) => p.id);
    // 15 is in B (12–17) and C (7–17), but B is in-person — only C is online.
    expect(ids).toEqual(["c"]);
  });
});
