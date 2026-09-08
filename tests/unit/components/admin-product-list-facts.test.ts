import { describe, it, expect } from "vitest";
import {
  productWhereLine,
  type ProductWhereSource,
} from "@/components/admin/products/product-where-line";
import {
  filterProductsBySearch,
  matchesProductSearch,
  normalizeProductSearch,
} from "@/components/admin/products/product-name-search";
import {
  filterClubProducts,
  type ClubFilterableProduct,
} from "@/components/admin/products/club-product-filter";
import type { Json, ProductType } from "@/types";

const ONLINE = "Online";

// One embedded location node, in the two columns a name needs plus the type
// the municipality walk keys on. `name_i18n` defaults to no overrides, which is
// what every Finnish row actually carries.
function node(
  id: string,
  name: string,
  type: "municipality" | "site" | "region",
  nameI18n: Json | null = null,
) {
  return { id, name, name_i18n: nameI18n, type } as const;
}

function product(overrides: {
  productType?: ProductType;
  isRemote?: boolean;
  location?: ProductWhereSource["locations"];
}): ProductWhereSource {
  return {
    product_type: overrides.productType ?? "consumer_club",
    is_remote: overrides.isRemote ?? false,
    locations: overrides.location ?? null,
  };
}

const tapiola = {
  ...node("site-1", "Tapiolan koulu", "site"),
  parent: node("muni-1", "Espoo", "municipality"),
};

describe("productWhereLine", () => {
  it("names the site and the municipality above it", () => {
    expect(productWhereLine(product({ location: tapiola }), "en", ONLINE)).toBe(
      "Tapiolan koulu · Espoo",
    );
  });

  it("names the site alone when nothing municipal sits above it", () => {
    const orphan = { ...node("site-2", "Some Hall", "site"), parent: null };
    expect(productWhereLine(product({ location: orphan }), "en", ONLINE)).toBe(
      "Some Hall",
    );
  });

  it("does not repeat a location that is itself the municipality", () => {
    const bare = { ...node("muni-1", "Espoo", "municipality"), parent: null };
    expect(productWhereLine(product({ location: bare }), "en", ONLINE)).toBe(
      "Espoo",
    );
  });

  it("says only 'online' for a remote product that is not a municipality club", () => {
    expect(
      productWhereLine(
        product({ isRemote: true, location: tapiola }),
        "en",
        ONLINE,
      ),
    ).toBe("Online");
  });

  it("still names the municipality for a remote municipality club", () => {
    const online = {
      ...node("muni-1", "Espoo", "municipality"),
      parent: null,
    };
    expect(
      productWhereLine(
        product({
          productType: "municipality_club",
          isRemote: true,
          location: online,
        }),
        "en",
        ONLINE,
      ),
    ).toBe("Online · Espoo");
  });

  it("names the municipality of a remote muni club anchored at a site", () => {
    expect(
      productWhereLine(
        product({
          productType: "municipality_club",
          isRemote: true,
          location: tapiola,
        }),
        "en",
        ONLINE,
      ),
    ).toBe("Online · Espoo");
  });

  it("has nothing to say for an in-person product with no location", () => {
    expect(productWhereLine(product({}), "en", ONLINE)).toBeNull();
  });

  it("renders the viewer's name for a municipality that has one", () => {
    const site = {
      ...node("site-3", "Nordsjö skola", "site"),
      parent: node("muni-2", "Helsinki", "municipality", {
        sv: "Helsingfors",
      }),
    };
    expect(productWhereLine(product({ location: site }), "sv", ONLINE)).toBe(
      "Nordsjö skola · Helsingfors",
    );
    expect(productWhereLine(product({ location: site }), "fi", ONLINE)).toBe(
      "Nordsjö skola · Helsinki",
    );
  });
});

describe("product name search", () => {
  const rows = [
    { id: "a", product_translations: [{ name: "Minecraft Club" }, { name: "Minecraft-kerho" }] },
    { id: "b", product_translations: [{ name: "Roblox Camp" }] },
    { id: "c", product_translations: [] },
  ];

  it("trims and lowercases what the admin typed", () => {
    expect(normalizeProductSearch("  RoBLoX  ")).toBe("roblox");
    expect(normalizeProductSearch("   ")).toBe("");
  });

  it("matches a substring case-insensitively", () => {
    expect(matchesProductSearch(rows[1], "blox c")).toBe(true);
    expect(matchesProductSearch(rows[1], "minecraft")).toBe(false);
  });

  it("matches any locale's name, not just the displayed one", () => {
    expect(matchesProductSearch(rows[0], "kerho")).toBe(true);
    expect(matchesProductSearch(rows[0], "club")).toBe(true);
  });

  it("matches everything on an empty needle", () => {
    expect(rows.every((row) => matchesProductSearch(row, ""))).toBe(true);
  });

  it("leaves the list untouched, and in order, for a blank query", () => {
    expect(filterProductsBySearch(rows, "  ")).toEqual(rows);
  });

  it("keeps the original order of the rows that match", () => {
    expect(filterProductsBySearch(rows, "C").map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("drops a product with no translated name at all", () => {
    expect(filterProductsBySearch(rows, "club").map((row) => row.id)).toEqual([
      "a",
    ]);
  });
});

// The four narrowings the admin club list's bar and the club switch's picker
// share. Both surfaces call this one predicate, so a rule proved here is the
// rule on both of them.
describe("filterClubProducts", () => {
  function club(
    overrides: Partial<ClubFilterableProduct> & { id: string },
  ): ClubFilterableProduct & { id: string } {
    return {
      product_translations: [{ name: `Club ${overrides.id}` }],
      schedule_slots: [{ weekday: 0 }],
      gedu_group_assignments: [{ gedu_id: "gedu-1" }],
      spoken_language_code: "en",
      ...overrides,
    };
  }

  // Three clubs differing in exactly the dimensions the bar narrows on, so a
  // predicate reading the wrong field cannot accidentally pass.
  const monday = club({ id: "a" });
  const wednesday = club({
    id: "b",
    schedule_slots: [{ weekday: 2 }, { weekday: 4 }],
    gedu_group_assignments: [{ gedu_id: "gedu-2" }],
    spoken_language_code: "fi",
    product_translations: [{ name: "Kerho b" }],
  });
  const unstaffed = club({
    id: "c",
    schedule_slots: [],
    gedu_group_assignments: [],
  });
  const clubs = [monday, wednesday, unstaffed];

  const ALL = { search: "", weekday: null, geduId: null, language: null };

  it("keeps every club, in order, when nothing is selected", () => {
    expect(filterClubProducts(clubs, ALL).map((row) => row.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("matches a weekday against any of the club's slots", () => {
    expect(
      filterClubProducts(clubs, { ...ALL, weekday: 4 }).map((row) => row.id),
    ).toEqual(["b"]);
    // A club with no slots at all answers no weekday.
    expect(
      filterClubProducts(clubs, { ...ALL, weekday: 0 }).map((row) => row.id),
    ).toEqual(["a"]);
  });

  it("matches an educator assigned to any group on the club", () => {
    expect(
      filterClubProducts(clubs, { ...ALL, geduId: "gedu-1" }).map(
        (row) => row.id,
      ),
    ).toEqual(["a"]);
    // A club with nobody assigned anywhere answers no educator.
    expect(
      filterClubProducts([unstaffed], { ...ALL, geduId: "gedu-1" }),
    ).toEqual([]);
  });

  it("matches the club's own spoken language", () => {
    expect(
      filterClubProducts(clubs, { ...ALL, language: "fi" }).map((row) => row.id),
    ).toEqual(["b"]);
  });

  it("ANDs every active filter, the search included", () => {
    expect(
      filterClubProducts(clubs, {
        search: "kerho",
        weekday: 2,
        geduId: "gedu-2",
        language: "fi",
      }).map((row) => row.id),
    ).toEqual(["b"]);
    // One filter disagreeing empties the result, however well the rest match.
    expect(
      filterClubProducts(clubs, {
        search: "kerho",
        weekday: 2,
        geduId: "gedu-1",
        language: "fi",
      }),
    ).toEqual([]);
  });
});
