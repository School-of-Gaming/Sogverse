import { describe, it, expect } from "vitest";
import { productIdFromSearch } from "@/lib/products/product-id-search";

const ID = "8e624b5f-d4bf-45e0-84d0-0c7613cbac29";

describe("productIdFromSearch", () => {
  it("reads a bare product ID, ignoring the spaces around it", () => {
    expect(productIdFromSearch(`  ${ID} `)).toBe(ID);
  });

  it("reads an uppercase ID and hands it back lowercased", () => {
    expect(productIdFromSearch(ID.toUpperCase())).toBe(ID);
  });

  it("is not an ID search when the ID sits inside a longer text", () => {
    expect(
      productIdFromSearch(`http://localhost:3000/en/admin/municipality-clubs/${ID}`),
    ).toBeNull();
    expect(productIdFromSearch(`${ID} ${ID}`)).toBeNull();
  });

  it("is not an ID search for a name", () => {
    expect(productIdFromSearch("Minecraft Club")).toBeNull();
    expect(productIdFromSearch("")).toBeNull();
  });

  it("is not an ID search for an ID one character short", () => {
    expect(productIdFromSearch(ID.slice(0, -1))).toBeNull();
  });
});
