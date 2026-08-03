import { describe, it, expect } from "vitest";
import { filterProducts } from "@/components/public/products/filter-products";
import type { ProductBrowseRow, ProductTopic } from "@/types";

// Row factory — only the fields filterProducts() looks at are overridable;
// every other ProductBrowseRow column carries an honest, fully-typed default
// so the fixture satisfies the row type with no cast.
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
    billing_mode: "paid",
    created_at: "2026-01-01T00:00:00.000Z",
    created_by: "admin-1",
    start_date: null,
    end_date: null,
    image_path: null,
    is_remote: overrides.isRemote ?? false,
    is_visible: true,
    location_id: null,
    min_age: overrides.minAge ?? 7,
    max_age: overrides.maxAge ?? 17,
    padlet_url: null,
    material_url: null,
    product_type: "consumer_club",
    refund_policy_days: null,
    primary_gedu_fee_cents: null,
    assistant_gedu_fee_cents: null,
    municipality_fee_cents: null,
    registration_opens_at: "2026-01-01T00:00:00.000Z",
    seat_count: null,
    signup_threshold: null,
    spoken_language_code: overrides.spokenLanguageCode ?? "en",
    status: "running",
    timezone: "Europe/Helsinki",
    topic: overrides.topic,
    updated_at: "2026-01-01T00:00:00.000Z",
    waitlist_enabled: false,
    product_translations: [],
    product_prices: [],
    schedule_slots: (overrides.weekdays ?? []).map((weekday) => ({
      weekday,
      start_time: "16:00:00",
      duration_minutes: 60,
    })),
    locations: null,
  };
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

  it("age keeps products whose [min_age, max_age] overlaps the band", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: null,
      languages: [],
      age: { min: 7, max: 9 },
      days: [],
    }).map((p) => p.id);
    // A is 7–9 (overlaps) and C is 7–17 (overlaps); B is 12–17 (no overlap).
    expect(ids.sort()).toEqual(["a", "c"]);
  });

  it("age matches when the band touches a product's edge", () => {
    // The 10–12 band overlaps B (12–17) at age 12 and C (7–17); A tops out at 9.
    const ids = filterProducts(ALL, {
      topics: [],
      format: null,
      languages: [],
      age: { min: 10, max: 12 },
      days: [],
    }).map((p) => p.id);
    expect(ids.sort()).toEqual(["b", "c"]);
  });

  it("ANDs age with other filters", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: "online",
      languages: [],
      age: { min: 13, max: 16 },
      days: [],
    }).map((p) => p.id);
    // The 13–16 band overlaps B (12–17) and C (7–17), but B is in-person —
    // only C is online.
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
