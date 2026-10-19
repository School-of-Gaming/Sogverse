import { describe, it, expect } from "vitest";
import {
  PRODUCT_LIST_TYPE_PARAM,
  parseAdminProductSlug,
  adminProductSlug,
} from "@/lib/products/admin-product-list-type";
import {
  productListCount,
  productListFilterOffer,
  productListMunicipalities,
  productListParamsAfterTypeSwitch,
  type ProductListFilterParams,
} from "@/components/admin/products/product-list-url-state";
import type { ProductListFacetsRow } from "@/services/products";
import { ROUTES } from "@/lib/constants/routes";
import type { ProductType } from "@/types";

const TYPES: ProductType[] = [
  "consumer_club",
  "municipality_club",
  "camp",
  "event",
];

describe("the admin product list's type param", () => {
  it.each(TYPES)("reads %s back from the value it writes", (type) => {
    expect(parseAdminProductSlug(adminProductSlug(type))).toBe(type);
  });

  it("gives every type its own value", () => {
    expect(new Set(TYPES.map(adminProductSlug)).size).toBe(TYPES.length);
  });

  it.each([null, undefined, "", "camp", "consumer_club", "CAMPS", "nonsense"])(
    "reads %j as every type",
    (value) => {
      expect(parseAdminProductSlug(value)).toBeNull();
    },
  );

  it.each(TYPES)("narrows the list link for %s through the same param", (type) => {
    expect(ROUTES.admin.productList(type)).toEqual({
      pathname: "/admin/products",
      query: { [PRODUCT_LIST_TYPE_PARAM]: adminProductSlug(type) },
    });
  });

  it("carries an old list URL's query, with its own type written last", () => {
    expect(
      ROUTES.admin.productList("camp", {
        q: "minecraft",
        day: ["1", "3"],
        type: "events",
        gedu: undefined,
      }),
    ).toEqual({
      pathname: "/admin/products",
      query: { q: "minecraft", day: ["1", "3"], [PRODUCT_LIST_TYPE_PARAM]: "camps" },
    });
  });
});

describe("productListFilterOffer", () => {
  it("offers a consumer club day and language", () => {
    expect(productListFilterOffer("consumer_club")).toEqual({
      day: true,
      language: true,
      municipality: false,
    });
  });

  it("offers a municipality club day and municipality", () => {
    expect(productListFilterOffer("municipality_club")).toEqual({
      day: true,
      language: false,
      municipality: true,
    });
  });

  it.each(["camp", "event"] as const)("offers %s nothing of its own", (type) => {
    expect(productListFilterOffer(type)).toEqual({
      day: false,
      language: false,
      municipality: false,
    });
  });

  it("withholds the day under every type, where it would drop camps and events", () => {
    expect(productListFilterOffer(null)).toEqual({
      day: false,
      language: false,
      municipality: false,
    });
  });
});

/** One type's facets, as the view reports them, from what its products carry. */
function row(fields: {
  type: ProductType;
  count?: number;
  weekdays?: number[];
  gedus?: string[];
  language?: ProductListFacetsRow["spoken_language_codes"][number];
  municipality?: string;
}): ProductListFacetsRow {
  return {
    product_type: fields.type,
    product_count: fields.count ?? 1,
    weekdays: fields.weekdays ?? [],
    gedu_ids: fields.gedus ?? [],
    spoken_language_codes: [fields.language ?? "fi"],
    municipalities:
      fields.municipality === undefined
        ? []
        : [
            {
              id: fields.municipality,
              name: fields.municipality,
              name_i18n: null,
              type: "municipality",
            },
          ],
  };
}

describe("productListCount", () => {
  const FACETS = [
    row({ type: "consumer_club", count: 3 }),
    row({ type: "camp", count: 2 }),
  ];

  it("counts one type's products", () => {
    expect(productListCount(FACETS, "camp")).toBe(2);
  });

  it("sums every type's under every type", () => {
    expect(productListCount(FACETS, null)).toBe(5);
  });

  it("reads a type with no facets row as none", () => {
    expect(productListCount(FACETS, "event")).toBe(0);
  });
});

describe("productListMunicipalities", () => {
  it("names each municipality once across the types", () => {
    const facets = [
      row({ type: "municipality_club", municipality: "espoo" }),
      row({ type: "consumer_club", municipality: "espoo" }),
      row({ type: "camp", municipality: "vantaa" }),
    ];
    expect(
      productListMunicipalities(facets, null).map((muni) => muni.id),
    ).toEqual(["espoo", "vantaa"]);
    expect(
      productListMunicipalities(facets, "municipality_club").map((m) => m.id),
    ).toEqual(["espoo"]);
  });
});

describe("productListParamsAfterTypeSwitch", () => {
  const PRODUCTS = [
    row({
      type: "consumer_club",
      weekdays: [1, 3],
      gedus: ["ada", "bo"],
      language: "en",
    }),
    row({
      type: "municipality_club",
      weekdays: [3],
      gedus: ["ada"],
      municipality: "espoo",
    }),
    row({ type: "camp", weekdays: [1], gedus: ["cy"] }),
  ];

  const NONE: ProductListFilterParams = {
    day: null,
    gedu: null,
    language: null,
    municipality: null,
  };

  it("clears a day the new type has no product on", () => {
    expect(
      productListParamsAfterTypeSwitch(PRODUCTS, "municipality_club", {
        ...NONE,
        day: "1",
      }).day,
    ).toBeNull();
  });

  it("keeps a day the new type still runs on", () => {
    expect(
      productListParamsAfterTypeSwitch(PRODUCTS, "municipality_club", {
        ...NONE,
        day: "3",
      }).day,
    ).toBe("3");
  });

  it("keeps a gedu who teaches both types, and clears one who does not", () => {
    expect(
      productListParamsAfterTypeSwitch(PRODUCTS, "municipality_club", {
        ...NONE,
        gedu: "ada",
      }).gedu,
    ).toBe("ada");
    expect(
      productListParamsAfterTypeSwitch(PRODUCTS, "municipality_club", {
        ...NONE,
        gedu: "bo",
      }).gedu,
    ).toBeNull();
  });

  it("clears a filter the new type does not offer, even with the value on its rows", () => {
    // The camp runs on a Monday, but a camp list offers no day control.
    expect(
      productListParamsAfterTypeSwitch(PRODUCTS, "camp", {
        day: "1",
        gedu: "cy",
        language: "en",
        municipality: "espoo",
      }),
    ).toEqual({ ...NONE, gedu: "cy" });
  });

  it("keeps only the gedu under every type", () => {
    expect(
      productListParamsAfterTypeSwitch(PRODUCTS, null, {
        day: "3",
        gedu: "cy",
        language: "en",
        municipality: "espoo",
      }),
    ).toEqual({ ...NONE, gedu: "cy" });
  });

  it("keeps the new type's own language and municipality values", () => {
    expect(
      productListParamsAfterTypeSwitch(PRODUCTS, "consumer_club", {
        ...NONE,
        language: "en",
      }).language,
    ).toBe("en");
    expect(
      productListParamsAfterTypeSwitch(PRODUCTS, "municipality_club", {
        ...NONE,
        municipality: "espoo",
      }).municipality,
    ).toBe("espoo");
  });
});
