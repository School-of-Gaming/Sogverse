import { describe, it, expect } from "vitest";
import {
  PRODUCT_LIST_TYPE_PARAM,
  parseProductListType,
  productListTypeParam,
} from "@/lib/products/admin-product-list-type";
import { productListFilterOffer } from "@/components/admin/products/product-list-url-state";
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
    expect(parseProductListType(productListTypeParam(type))).toBe(type);
  });

  it("gives every type its own value", () => {
    expect(new Set(TYPES.map(productListTypeParam)).size).toBe(TYPES.length);
  });

  it.each([null, undefined, "", "camp", "consumer_club", "CAMPS", "nonsense"])(
    "reads %j as every type",
    (value) => {
      expect(parseProductListType(value)).toBeNull();
    },
  );

  it.each(TYPES)("narrows the list link for %s through the same param", (type) => {
    expect(ROUTES.admin.productList(type)).toEqual({
      pathname: "/admin/products",
      query: { [PRODUCT_LIST_TYPE_PARAM]: productListTypeParam(type) },
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
