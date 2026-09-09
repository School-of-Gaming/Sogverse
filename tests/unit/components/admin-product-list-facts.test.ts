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
