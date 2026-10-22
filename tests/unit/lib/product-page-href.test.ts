import { describe, expect, it } from "vitest";
import { productPageHref } from "@/lib/products/product-page-href";

/**
 * **Where a card links a product by default.** The shop's page for every type
 * it sells; for a municipality club, its page under its town's `/schools`
 * address with the slug the town's own list links with — derived from the
 * town's name in the reader's locale.
 */

const ID = "c3000000-0000-4000-8000-000000000001";
const ESPOO = {
  id: "d1000000-0000-4000-8000-000000000001",
  name: "Espoo",
  name_i18n: { sv: "Esbo" },
  type: "municipality" as const,
  parent: null,
};
const SITE = {
  id: "d1000000-0000-4000-8000-000000000002",
  name: "Tapiola school",
  name_i18n: null,
  type: "site" as const,
  parent: ESPOO,
};

describe("productPageHref", () => {
  it("links a shop product to its shop page", () => {
    expect(productPageHref({ id: ID, product_type: "camp", locations: null }, "fi")).toEqual({
      pathname: "/shop/[id]",
      params: { id: ID },
    });
  });

  it("links a municipality club under its town's schools page, in the reader's spelling", () => {
    const online = { id: ID, product_type: "municipality_club" as const, locations: ESPOO };
    expect(productPageHref(online, "fi")).toEqual({
      pathname: "/schools/[municipalityName]/[id]",
      params: { municipalityName: "espoo", id: ID },
    });
    expect(productPageHref(online, "sv")).toMatchObject({
      params: { municipalityName: "esbo", id: ID },
    });
    // An in-person club sits at a site inside the town.
    expect(
      productPageHref({ ...online, locations: SITE }, "en"),
    ).toMatchObject({ params: { municipalityName: "espoo", id: ID } });
  });

  it("falls back to the shop page for a municipality club with no town", () => {
    expect(
      productPageHref({ id: ID, product_type: "municipality_club", locations: null }, "en"),
    ).toEqual({ pathname: "/shop/[id]", params: { id: ID } });
  });
});
