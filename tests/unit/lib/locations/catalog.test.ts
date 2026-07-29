import { describe, it, expect } from "vitest";
import {
  CATALOG_SEARCH_LIMIT,
  buildCatalogIndex,
  findLeafChain,
  isCatalogCountry,
  normalizeForSearch,
  searchCatalogIndex,
  type LocationCatalog,
} from "@/lib/locations/catalog";

/**
 * The catalog readers are the layer between a generated static asset and both
 * consumers of it — the materialization route and the picker. What matters is
 * that a lookup is unambiguous (France reuses codes across levels), that the
 * search folds diacritics (nobody types "Nîmes"), and that the result cap
 * cannot cost a prefix match its place.
 */

const FR: LocationCatalog = {
  country: "FR",
  source: "test fixture",
  release: "2026",
  generated: "2026-01-01",
  levels: ["region", "district", "municipality"],
  counts: [2, 2, 4],
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

describe("findLeafChain", () => {
  it("returns the whole chain, root first", () => {
    expect(findLeafChain(FR, "59350")).toEqual([
      ["32", "Hauts-de-France", expect.anything()],
      ["59", "Nord", expect.anything()],
      ["59350", "Lille"],
    ]);
  });

  it("handles a country that skips a level", () => {
    const chain = findLeafChain(FI, "091");
    expect(chain).toHaveLength(2);
    expect(chain?.[1][1]).toBe("Helsinki");
  });

  it("matches only at leaf depth, so a région code is not a commune", () => {
    // "32" is a real code in this catalog — as a région, not a commune.
    expect(findLeafChain(FR, "32")).toBeNull();
    expect(findLeafChain(FR, "59")).toBeNull();
  });

  it("returns null for a code that is not in the catalog", () => {
    expect(findLeafChain(FR, "99999")).toBeNull();
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

    expect(index).toHaveLength(4);
    expect(index[0]).toEqual({
      code: "59350",
      name: "Lille",
      ancestors: ["Nord", "Hauts-de-France"],
      normalized: "lille",
    });
  });

  it("carries no non-leaf entries", () => {
    const codes = buildCatalogIndex(FI).map((e) => e.code);
    expect(codes).toEqual(["091", "049"]);
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

  it("ranks prefix matches ahead of infix ones", () => {
    // "ill" is a prefix of nothing here and an infix of Lille; "lil" is a
    // prefix of Lille. Adding a second infix match proves the ordering.
    const { entries } = searchCatalogIndex(index, "l");
    expect(entries[0].name).toBe("Lille");
  });

  it("returns nothing for an empty or whitespace query", () => {
    expect(searchCatalogIndex(index, "")).toEqual({ entries: [], total: 0 });
    expect(searchCatalogIndex(index, "   ")).toEqual({ entries: [], total: 0 });
  });

  it("caps rendered results but still counts every match", () => {
    // A synthetic index far larger than the cap, all matching.
    const many = Array.from({ length: CATALOG_SEARCH_LIMIT * 3 }, (_, i) => ({
      code: String(i),
      name: `Ville ${i}`,
      ancestors: [] as string[],
      normalized: `ville ${i}`,
    }));

    const { entries, total } = searchCatalogIndex(many, "ville");

    expect(entries).toHaveLength(CATALOG_SEARCH_LIMIT);
    expect(total).toBe(CATALOG_SEARCH_LIMIT * 3);
  });
});
