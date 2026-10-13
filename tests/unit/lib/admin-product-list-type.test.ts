import { describe, it, expect } from "vitest";
import {
  PRODUCT_LIST_TYPE_PARAM,
  parseAdminProductSlug,
  adminProductSlug,
} from "@/lib/products/admin-product-list-type";
import {
  productListFilterOffer,
  productListParamsAfterTypeSwitch,
  type ProductListFilterParams,
  type ProductListFilterRow,
} from "@/components/admin/products/product-list-url-state";
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

describe("productListParamsAfterTypeSwitch", () => {
  /** A product row carrying only what the filters read. */
  function row(fields: {
    type: ProductType;
    weekdays?: number[];
    gedus?: string[];
    language?: ProductListFilterRow["spoken_language_code"];
    municipality?: string;
  }): ProductListFilterRow {
    return {
      product_type: fields.type,
      schedule_slots: (fields.weekdays ?? []).map((weekday) => ({
        weekday,
        start_time: "16:00:00",
        duration_minutes: 60,
      })),
      gedu_group_assignments: (fields.gedus ?? []).map((gedu_id) => ({
        gedu_id,
      })),
      spoken_language_code: fields.language ?? "fi",
      locations:
        fields.municipality === undefined
          ? null
          : {
              id: fields.municipality,
              name: fields.municipality,
              name_i18n: null,
              type: "municipality",
              parent: null,
            },
    };
  }

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
