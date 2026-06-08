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
  // Weekdays (0=Mon..6=Sun) the product's recurring schedule touches. Each
  // becomes a schedule_slot; only `weekday` matters for filterProducts().
  weekdays?: number[];
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
    schedule_slots: (overrides.weekdays ?? []).map((weekday) => ({
      weekday,
      start_time: "16:00:00",
      duration_minutes: 60,
    })),
    locations: null,
  } as unknown as ProductBrowseRow;
}

const A = row({
  id: "a",
  topic: "minecraft_java",
  isRemote: true,
  spokenLanguageCode: "en",
  minAge: 7,
  maxAge: 9,
  weekdays: [0, 2], // Mon, Wed
});
const B = row({
  id: "b",
  topic: "fortnite",
  isRemote: false,
  spokenLanguageCode: "fi",
  minAge: 12,
  maxAge: 17,
  weekdays: [4], // Fri
});
const C = row({
  id: "c",
  topic: "webinar",
  isRemote: true,
  spokenLanguageCode: "fi",
  minAge: 7,
  maxAge: 17,
  weekdays: [], // schedule TBD — no slots
});

const ALL = [A, B, C];

describe("filterProducts", () => {
  it("returns everything when filters are empty", () => {
    expect(
      filterProducts(ALL, {
        topics: [],
        format: null,
        languages: [],
        age: null,
        days: [],
      }),
    ).toEqual(ALL);
  });

  it("matches a single topic", () => {
    expect(
      filterProducts(ALL, {
        topics: ["minecraft_java"],
        format: null,
        languages: [],
        age: null,
        days: [],
      }).map((p) => p.id),
    ).toEqual(["a"]);
  });

  it("OR-combines topics", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft_java", "fortnite"],
      format: null,
      languages: [],
      age: null,
      days: [],
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
        days: [],
      }),
    ).toEqual([]);
  });

  it("format=online keeps only remote products", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: "online",
      languages: [],
      age: null,
      days: [],
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
      days: [],
    }).map((p) => p.id);
    expect(ids).toEqual(["b"]);
  });

  it("ANDs format with topic filters", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft_java", "fortnite"],
      format: "online",
      languages: [],
      age: null,
      days: [],
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
      days: [],
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
      days: [],
    }).map((p) => p.id);
    expect(ids.sort()).toEqual(["a", "b", "c"]);
  });

  it("ANDs language with topic and format filters", () => {
    const ids = filterProducts(ALL, {
      topics: ["minecraft_java", "fortnite"],
      format: null,
      languages: ["en"],
      age: null,
      days: [],
    }).map((p) => p.id);
    // A is minecraft_java + en; B is fortnite but fi.
    expect(ids).toEqual(["a"]);
  });

  it("age keeps products whose [min_age, max_age] band includes it", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: null,
      languages: [],
      age: 8,
      days: [],
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
      days: [],
    }).map((p) => p.id);
    // 9 is A's max_age (inclusive) and inside C's band.
    expect(lower.sort()).toEqual(["a", "c"]);

    const upper = filterProducts(ALL, {
      topics: [],
      format: null,
      languages: [],
      age: 12,
      days: [],
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
      days: [],
    }).map((p) => p.id);
    // 15 is in B (12–17) and C (7–17), but B is in-person — only C is online.
    expect(ids).toEqual(["c"]);
  });

  it("days matches products whose schedule touches a selected weekday", () => {
    // A meets Mon/Wed (0,2), B meets Fri (4), C has no slots.
    const ids = filterProducts(ALL, {
      topics: [],
      format: null,
      languages: [],
      age: null,
      days: [2], // Wed
    }).map((p) => p.id);
    expect(ids).toEqual(["a"]);
  });

  it("OR-combines days (match-any across the selected set)", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: null,
      languages: [],
      age: null,
      days: [0, 4], // Mon or Fri
    }).map((p) => p.id);
    // A meets Mon, B meets Fri; C has no slots so it never matches.
    expect(ids.sort()).toEqual(["a", "b"]);
  });

  it("days excludes products with no schedule slots", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: null,
      languages: [],
      age: null,
      days: [1, 3, 5], // Tue/Thu/Sat — nobody meets these
    }).map((p) => p.id);
    expect(ids).toEqual([]);
  });

  it("ANDs days with other filters", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: "online",
      languages: [],
      age: null,
      days: [0], // Mon
    }).map((p) => p.id);
    // A meets Mon and is online; B meets Fri (wrong day); only A passes.
    expect(ids).toEqual(["a"]);
  });
});
