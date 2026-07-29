import { describe, it, expect } from "vitest";
import {
  CATALOG_SEARCH_LIMIT,
  buildCatalogIndex,
  catalogRefKey,
  isCatalogCountry,
  normalizeForSearch,
  searchCatalogIndex,
  type LocationCatalog,
} from "@/lib/locations/catalog";

/**
 * The catalog readers are the layer between a generated static asset and the
 * picker UI that browses it. What matters is that the search folds diacritics
 * (nobody types "Nîmes"), that a tick's key stays unambiguous across levels
 * (France reuses each région code as a département code), and that the result
 * cap cannot cost a prefix match its place.
 */

const FR: LocationCatalog = {
  country: "FR",
  source: "test fixture",
  release: "2026",
  generated: "2026-01-01",
  levels: ["region", "district", "municipality"],
  counts: [3, 3, 5],
  tree: [
    [
      "32",
      "Hauts-de-France",
      [
        [
          "59",
          "Nord",
          [
            ["59350", "Lille"],
            ["59512", "Roubaix"],
          ],
        ],
      ],
    ],
    [
      "76",
      "Occitanie",
      [
        [
          "30",
          "Gard",
          [
            ["30189", "Nîmes"],
            ["30032", "Beaucaire"],
          ],
        ],
      ],
    ],
    // Corsica carries the catalog's one structural oddity: alphabetic INSEE
    // codes (2A/2B). Any code-matching logic must survive the uppercase.
    [
      "94",
      "Corse",
      [["2A", "Corse-du-Sud", [["2A004", "Ajaccio"]]]],
    ],
  ],
};

const FI: LocationCatalog = {
  country: "FI",
  source: "test fixture",
  release: "2026",
  generated: "2026-01-01",
  levels: ["region", "municipality"],
  counts: [1, 2],
  tree: [
    [
      "01",
      "Uusimaa",
      [
        ["091", "Helsinki"],
        ["049", "Espoo"],
      ],
    ],
  ],
};

describe("isCatalogCountry", () => {
  it("accepts the countries that ship a catalog", () => {
    expect(isCatalogCountry("FI")).toBe(true);
    expect(isCatalogCountry("FR")).toBe(true);
  });

  it("rejects everything else, including nothing at all", () => {
    expect(isCatalogCountry("GB")).toBe(false);
    expect(isCatalogCountry(null)).toBe(false);
    expect(isCatalogCountry(undefined)).toBe(false);
  });
});

describe("normalizeForSearch", () => {
  it("folds diacritics and case", () => {
    expect(normalizeForSearch("Nîmes")).toBe("nimes");
    expect(normalizeForSearch("Järvenpää")).toBe("jarvenpaa");
    expect(normalizeForSearch("Côte-d'Or")).toBe("cote-d'or");
  });
});

describe("buildCatalogIndex", () => {
  it("flattens to leaves with their ancestors nearest first", () => {
    const index = buildCatalogIndex(FR);

    expect(index).toHaveLength(5);
    expect(index[0]).toEqual({
      code: "59350",
      type: "municipality",
      name: "Lille",
      ancestors: ["Nord", "Hauts-de-France"],
      normalized: "lille",
    });
  });

  it("carries no non-leaf entries", () => {
    const codes = buildCatalogIndex(FI).map((e) => e.code);
    expect(codes).toEqual(["091", "049"]);
  });

  it("indexes every level on request, each typed by its depth", () => {
    // What coverage ticking needs: a gedu covering the whole département has
    // to be able to find it, and a search that only knows leaves cannot.
    const index = buildCatalogIndex(FR, { includeAllLevels: true });

    expect(index).toHaveLength(3 + 3 + 5);
    expect(index.find((e) => e.name === "Nord")).toEqual({
      code: "59",
      type: "district",
      name: "Nord",
      ancestors: ["Hauts-de-France"],
      normalized: "nord",
    });
    expect(index.find((e) => e.name === "Hauts-de-France")?.type).toBe("region");
  });

  it("takes the level type from the catalog, so a country skipping one is right", () => {
    // Finland has no district level: its leaves are municipalities directly
    // under regions.
    const index = buildCatalogIndex(FI, { includeAllLevels: true });
    expect(index.map((e) => [e.name, e.type])).toEqual([
      ["Uusimaa", "region"],
      ["Helsinki", "municipality"],
      ["Espoo", "municipality"],
    ]);
  });
});

describe("catalogRefKey", () => {
  it("separates the same code at two levels", () => {
    // France reuses every one of its 18 région codes as a département code, so
    // a key that ignored the type would collapse two different places into one.
    expect(catalogRefKey({ country: "FR", type: "region", code: "32" })).not.toBe(
      catalogRefKey({ country: "FR", type: "district", code: "32" }),
    );
  });

  it("separates the same code in two countries", () => {
    expect(catalogRefKey({ country: "FI", type: "municipality", code: "091" })).not.toBe(
      catalogRefKey({ country: "FR", type: "municipality", code: "091" }),
    );
  });
});

describe("searchCatalogIndex", () => {
  const index = buildCatalogIndex(FR);

  it("finds a diacritic name from an unaccented query", () => {
    const { entries } = searchCatalogIndex(index, "nimes");
    expect(entries.map((e) => e.name)).toEqual(["Nîmes"]);
  });

  it("matches the official code too", () => {
    const { entries } = searchCatalogIndex(index, "59512");
    expect(entries.map((e) => e.name)).toEqual(["Roubaix"]);
  });

  it("matches an alphabetic Corsican code in either case", () => {
    // 360 real communes have 2A/2B codes; the search needle is lowercased by
    // normalizeForSearch, so the code side must fold case too.
    expect(searchCatalogIndex(index, "2A004").entries.map((e) => e.name)).toEqual(["Ajaccio"]);
    expect(searchCatalogIndex(index, "2a004").entries.map((e) => e.name)).toEqual(["Ajaccio"]);
  });

  it("a prefix match found late in the scan outranks infix matches found early", () => {
    // The property that matters at France's scale: typing "lil" hits
    // thousands of infix matches before the scan ever reaches a
    // prefix-matching commune late in the index. The buckets fill
    // independently, so the late prefix match still ranks first — a single
    // capped-then-sorted array would have dropped it.
    const manyInfix = Array.from({ length: CATALOG_SEARCH_LIMIT * 2 }, (_, i) => ({
      code: String(i),
      type: "municipality" as const,
      name: `Ville-lil-${i}`,
      ancestors: [] as string[],
      normalized: `ville-lil-${i}`,
    }));
    const latePrefix = {
      code: "99999",
      type: "municipality" as const,
      name: "Lille",
      ancestors: [] as string[],
      normalized: "lille",
    };

    const { entries, total } = searchCatalogIndex(
      [...manyInfix, latePrefix],
      "lil",
    );

    expect(entries[0].name).toBe("Lille");
    expect(total).toBe(manyInfix.length + 1);
  });

  it("returns nothing for an empty or whitespace query", () => {
    expect(searchCatalogIndex(index, "")).toEqual({ entries: [], total: 0 });
    expect(searchCatalogIndex(index, "   ")).toEqual({ entries: [], total: 0 });
  });

  it("caps rendered results but still counts every match", () => {
    // A synthetic index far larger than the cap, all matching.
    const many = Array.from({ length: CATALOG_SEARCH_LIMIT * 3 }, (_, i) => ({
      code: String(i),
      type: "municipality" as const,
      name: `Ville ${i}`,
      ancestors: [] as string[],
      normalized: `ville ${i}`,
    }));

    const { entries, total } = searchCatalogIndex(many, "ville");

    expect(entries).toHaveLength(CATALOG_SEARCH_LIMIT);
    expect(total).toBe(CATALOG_SEARCH_LIMIT * 3);
  });
});
