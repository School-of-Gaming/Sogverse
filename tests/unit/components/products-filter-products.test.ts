import { describe, it, expect } from "vitest";
import { filterProducts } from "@/components/public/products/filter-products";
import { PRODUCT_TAG_VALUES } from "@/components/public/products/product-tag";
import type {
  ProductBrowseRow,
  ProductTag,
  ProductTopic,
  ProductType,
  SpokenLanguageCode,
} from "@/types";

// Row factory — only the fields filterProducts() looks at are overridable;
// every other ProductBrowseRow column carries an honest, fully-typed default
// so the fixture satisfies the row type with no cast.
function row(overrides: {
  id: string;
  topic: ProductTopic;
  productType?: ProductType;
  isRemote?: boolean;
  spokenLanguageCode?: SpokenLanguageCode;
  // Null on both is the adults-only shape: a product with no gamer audience
  // carries no age range at all.
  minAge?: number | null;
  maxAge?: number | null;
  forGamers?: boolean;
  forParents?: boolean;
  // Null is untagged — the ordinary state, and the factory's default.
  tag?: ProductTag | null;
  // Weekdays (0=Mon..6=Sun) the product's schedule touches. Each becomes a
  // schedule_slot; only `weekday` matters for filterProducts().
  weekdays?: number[];
}): ProductBrowseRow {
  return {
    id: overrides.id,
    billing_mode: "paid",
    start_date: null,
    end_date: null,
    image_path: null,
    is_remote: overrides.isRemote ?? false,
    for_gamers: overrides.forGamers ?? true,
    for_parents: overrides.forParents ?? false,
    min_age: overrides.minAge === undefined ? 7 : overrides.minAge,
    max_age: overrides.maxAge === undefined ? 17 : overrides.maxAge,
    tag: overrides.tag ?? null,
    product_type: overrides.productType ?? "consumer_club",
    registration_opens_at: "2026-01-01T00:00:00.000Z",
    seat_count: null,
    signup_threshold: null,
    spoken_language_code: overrides.spokenLanguageCode ?? "en",
    status: "running",
    timezone: "Europe/Helsinki",
    topic: overrides.topic,
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
  topic: "roblox_studio",
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
        audiences: [],
        tags: [],
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
        audiences: [],
        tags: [],
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
      audiences: [],
      tags: [],
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
        audiences: [],
        tags: [],
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
      audiences: [],
      tags: [],
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
      audiences: [],
      tags: [],
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
      audiences: [],
      tags: [],
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
      audiences: [],
      tags: [],
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
      audiences: [],
      tags: [],
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
      audiences: [],
      tags: [],
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
      audiences: [],
      tags: [],
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
      audiences: [],
      tags: [],
      age: { min: 10, max: 12 },
      days: [],
    }).map((p) => p.id);
    expect(ids.sort()).toEqual(["b", "c"]);
  });

  it("drops a product with no age range from a band-filtered result", () => {
    // A band expresses "shopping for a child of this age", so an adults-only
    // product — no gamer audience, therefore no range — is not a near miss.
    const adultsOnly = row({
      id: "adults",
      topic: "minecraft_java",
      forGamers: false,
      forParents: true,
      minAge: null,
      maxAge: null,
    });
    const base = {
      topics: [] as string[],
      format: null,
      languages: [] as SpokenLanguageCode[],
      audiences: [],
      tags: [],
      days: [] as number[],
    };

    // Unfiltered it is present, so its absence below is the filter's doing.
    expect(
      filterProducts([...ALL, adultsOnly], { ...base, age: null }).map(
        (p) => p.id,
      ),
    ).toContain("adults");

    expect(
      filterProducts([...ALL, adultsOnly], {
        ...base,
        age: { min: 7, max: 9 },
      }).map((p) => p.id),
    ).not.toContain("adults");
  });

  it("ANDs age with other filters", () => {
    const ids = filterProducts(ALL, {
      topics: [],
      format: "online",
      languages: [],
      audiences: [],
      tags: [],
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
      audiences: [],
      tags: [],
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
      audiences: [],
      tags: [],
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
      audiences: [],
      tags: [],
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
      audiences: [],
      tags: [],
      age: null,
      days: [0], // Mon
    }).map((p) => p.id);
    // A meets Mon and is online; B meets Fri (wrong day); only A passes.
    expect(ids).toEqual(["a"]);
  });

  it("applies days to camps and events, not just clubs", () => {
    // The day filter is universal: every product type's slots carry a weekday,
    // and "which days is my child busy" is the same question for a camp day or
    // a one-off event as it is for a weekly club.
    const camp = row({
      id: "camp",
      topic: "minecraft_java",
      productType: "camp",
      weekdays: [1, 2], // Tue, Wed
    });
    const event = row({
      id: "event",
      topic: "fortnite",
      productType: "event",
      weekdays: [5], // Sat
    });
    const rows = [camp, event];

    expect(
      filterProducts(rows, {
        topics: [],
        format: null,
        languages: [],
        audiences: [],
        tags: [],
        age: null,
        days: [1],
      }).map((p) => p.id),
    ).toEqual(["camp"]);
    expect(
      filterProducts(rows, {
        topics: [],
        format: null,
        languages: [],
        audiences: [],
        tags: [],
        age: null,
        days: [5],
      }).map((p) => p.id),
    ).toEqual(["event"]);
    expect(
      filterProducts(rows, {
        topics: [],
        format: null,
        languages: [],
        audiences: [],
        tags: [],
        age: null,
        days: [0], // Mon — neither meets then
      }),
    ).toEqual([]);
  });

  /**
   * The audience row, and the one thing that makes it unlike the topic and
   * language rows beside it: a chip is a *tag*, not a flag. "For parents"
   * matches the parents-only shape and "For families" matches the both-flags
   * shape, one chip per badge a card can wear — so gamers-only products, the
   * assumed default that wears none, answer to no chip at all. Lighting every
   * chip is therefore *narrower* than lighting none, which is the inversion
   * these cases exist to pin.
   */
  describe("audience", () => {
    const parentsOnly = row({
      id: "parents",
      topic: "minecraft_java",
      forGamers: false,
      forParents: true,
      minAge: null,
      maxAge: null,
    });
    const both = row({
      id: "both",
      topic: "minecraft_java",
      forGamers: true,
      forParents: true,
    });
    const rows = [...ALL, parentsOnly, both];
    const base = {
      topics: [] as string[],
      format: null,
      languages: [] as SpokenLanguageCode[],
      tags: [] as ProductTag[],
      age: null,
      days: [] as number[],
    };

    it("passes everything when nothing is selected", () => {
      expect(
        filterProducts(rows, { ...base, audiences: [] }).map((p) => p.id),
      ).toEqual(rows.map((p) => p.id));
    });

    it("keeps only the parents-only product under the parents chip", () => {
      // Not the mixed one: that product's badge says "For families", so it
      // belongs to the other chip and to no part of this one.
      expect(
        filterProducts(rows, { ...base, audiences: ["parents"] })
          .map((p) => p.id)
          .sort(),
      ).toEqual(["parents"]);
    });

    it("keeps only the mixed product under the families chip", () => {
      expect(
        filterProducts(rows, { ...base, audiences: ["families"] })
          .map((p) => p.id)
          .sort(),
      ).toEqual(["both"]);
    });

    it("ORs the two chips — every badged product, and nothing else", () => {
      // Both lit is a union of the two tags, not a return to the unfiltered
      // grid: the three gamers-only products wear no badge and stay out.
      expect(
        filterProducts(rows, { ...base, audiences: ["parents", "families"] })
          .map((p) => p.id)
          .sort(),
      ).toEqual(["both", "parents"]);
    });

    it("surfaces a gamers-only product under no chip at all", () => {
      // The one asymmetry worth stating outright: the default audience is
      // reachable only by clearing the row (or by any other filter), which is
      // what makes a lit chip row narrower than an empty one.
      for (const audiences of [
        ["parents"] as const,
        ["families"] as const,
        ["parents", "families"] as const,
      ]) {
        expect(
          filterProducts(rows, { ...base, audiences: [...audiences] }).map(
            (p) => p.id,
          ),
        ).not.toContain("a");
      }
      // Every other row still reaches it: the audience row is the only one
      // that treats gamers-only as unmatched.
      expect(
        filterProducts(rows, {
          ...base,
          audiences: [],
          topics: ["fortnite"],
        }).map((p) => p.id),
      ).toEqual(["b"]);
    });

    it("ANDs with the other rows", () => {
      // The two badged rows are both in-person (the factory's default), so an
      // online + families query keeps neither.
      expect(
        filterProducts(rows, {
          ...base,
          audiences: ["families"],
          format: "online",
        }).map((p) => p.id),
      ).toEqual([]);
    });

    it("drops a parents-only product from an age band, chip or no chip", () => {
      // The two filters answer different questions and never stand in for each
      // other: a band means "shopping for a child of this age", so a product
      // with no gamer range drops out of it even with its own chip lit — and
      // the families chip is the one that keeps the mixed product there.
      expect(
        filterProducts(rows, {
          ...base,
          audiences: ["parents"],
          age: { min: 7, max: 9 },
        }).map((p) => p.id),
      ).toEqual([]);
      expect(
        filterProducts(rows, {
          ...base,
          audiences: ["families"],
          age: { min: 7, max: 9 },
        }).map((p) => p.id),
      ).toEqual(["both"]);
    });
  });

  /**
   * The design-tag row, which behaves like the audience row above and unlike
   * the topic and language rows beside it: a chip is the chip the card wears,
   * so it matches exactly the products carrying that tag, and an untagged
   * product — the ordinary state, wearing no chip — answers only an empty row.
   * Lighting every chip is therefore narrower than lighting none.
   */
  describe("tag", () => {
    const neuro = row({
      id: "neuro",
      topic: "minecraft_java",
      tag: "neuroinclusive",
    });
    const beginner = row({
      id: "beginner",
      topic: "minecraft_java",
      tag: "beginner",
      isRemote: true,
    });
    const advanced = row({
      id: "advanced",
      topic: "fortnite",
      tag: "advanced",
    });
    const tagged = [neuro, beginner, advanced];
    // ALL is three untagged products; the three above are one per tag value.
    const rows = [...ALL, ...tagged];
    const base = {
      topics: [] as string[],
      format: null,
      languages: [] as SpokenLanguageCode[],
      audiences: [],
      age: null,
      days: [] as number[],
    };

    it("passes everything when nothing is selected", () => {
      expect(
        filterProducts(rows, { ...base, tags: [] }).map((p) => p.id),
      ).toEqual(rows.map((p) => p.id));
    });

    it("keeps exactly the products wearing a chip's tag", () => {
      // Chip-equals-tag, stated over the whole vocabulary rather than one
      // value at a time: whatever the enum holds, a lone chip's result set is
      // precisely the rows whose `tag` column is that value. A fourth tag added
      // by migration is covered here the day it exists.
      for (const tag of PRODUCT_TAG_VALUES) {
        expect(
          filterProducts(rows, { ...base, tags: [tag] }).map((p) => p.id),
        ).toEqual(rows.filter((p) => p.tag === tag).map((p) => p.id));
      }
    });

    it("ORs the chips — the union of their tags, and nothing else", () => {
      expect(
        filterProducts(rows, {
          ...base,
          tags: ["neuroinclusive", "advanced"],
        }).map((p) => p.id),
      ).toEqual(["neuro", "advanced"]);
    });

    it("surfaces an untagged product under no chip at all", () => {
      // The inversion worth pinning: every chip lit is every *tagged* product,
      // which is narrower than the unfiltered grid — the untagged majority is
      // reachable only by clearing the row.
      expect(
        filterProducts(rows, { ...base, tags: [...PRODUCT_TAG_VALUES] }).map(
          (p) => p.id,
        ),
      ).toEqual(tagged.map((p) => p.id));
      for (const tag of PRODUCT_TAG_VALUES) {
        expect(
          filterProducts(rows, { ...base, tags: [tag] }).map((p) => p.id),
        ).not.toContain("a");
      }
      // Every other row still reaches the untagged products: the tag row is the
      // only one that treats "no tag" as unmatched.
      expect(
        filterProducts(rows, {
          ...base,
          tags: [],
          topics: ["roblox_studio"],
        }).map((p) => p.id),
      ).toEqual(["c"]);
    });

    it("ANDs with the other rows", () => {
      // Beginner is the only remote tagged product, so an online + beginner
      // query keeps it and an online + advanced query keeps nothing.
      expect(
        filterProducts(rows, {
          ...base,
          tags: ["beginner"],
          format: "online",
        }).map((p) => p.id),
      ).toEqual(["beginner"]);
      expect(
        filterProducts(rows, {
          ...base,
          tags: ["advanced"],
          format: "online",
        }).map((p) => p.id),
      ).toEqual([]);
    });
  });
});
