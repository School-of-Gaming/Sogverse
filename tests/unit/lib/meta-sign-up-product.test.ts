import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * The product a sign-up started from: what the account-creation report may name.
 * ============================================================================
 *
 * The value arrives from the registration body, so a client can send anything.
 * Pinned here: only a same-origin shop product page — in any locale's slug —
 * is read at all, only an advertised product is named, and every other answer,
 * a failed read included, is "no product" rather than an error.
 */

const PRODUCT_ID = "0f8b6c1e-3c2a-4d5e-9f60-7a8b9c0d1e2f";

const mockFrom = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
vi.mock("@/lib/supabase/anon", () => ({
  createAnonClient: () => ({
    from: (...args: unknown[]) => {
      mockFrom(...args);
      return {
        select: () => ({
          eq: (...eqArgs: unknown[]) => {
            mockEq(...eqArgs);
            return { maybeSingle: () => mockMaybeSingle() };
          },
        }),
      };
    },
  }),
}));

import { signUpProductFor } from "@/lib/meta-sign-up-product.server";

/** A product row as the read returns it. */
function productRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    product_type: "consumer_club",
    billing_mode: "subscription",
    topic: "roblox_studio",
    product_translations: [
      { locale: "fi", name: "Roblox Studio -kerho" },
      { locale: "en", name: "Roblox Studio Club" },
    ],
    product_prices: [{ currency: "eur", price_cents: 4900 }],
    ...overrides,
  };
}

beforeEach(() => {
  mockMaybeSingle.mockResolvedValue({ data: productRow(), error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("signUpProductFor — an advertised product page", () => {
  it("names the product in the enrolment's own fields", async () => {
    expect(await signUpProductFor(`/en/shop/${PRODUCT_ID}`)).toEqual({
      content_ids: [PRODUCT_ID],
      content_type: "product",
      content_name: "Roblox Studio Club",
      content_category: "roblox_studio",
      value: 49,
      currency: "EUR",
    });
    expect(mockFrom).toHaveBeenCalledWith("products");
    expect(mockEq).toHaveBeenCalledWith("id", PRODUCT_ID);
  });

  // The redirect is the raw path the reader was on, so a translated slug and a
  // query string are ordinary.
  it("accepts a translated slug and ignores the query", async () => {
    const product = await signUpProductFor(`/fi/kauppa/${PRODUCT_ID}?x=1#top`);

    expect(product?.content_ids).toEqual([PRODUCT_ID]);
    expect(mockEq).toHaveBeenCalledWith("id", PRODUCT_ID);
  });
});

describe("signUpProductFor — names nothing", () => {
  it.each([
    ["no redirect", undefined],
    ["an empty one", ""],
    ["another origin", `https://evil.example/en/shop/${PRODUCT_ID}`],
    ["a protocol-relative one", `//evil.example/en/shop/${PRODUCT_ID}`],
    ["the shop listing", "/en/shop"],
    ["the confirmation page", "/en/shop/confirmation"],
    ["a municipality club page", `/en/schools/helsinki/${PRODUCT_ID}`],
    ["a path climbing out of the shop", `/en/shop/../admin`],
    ["an id that is not a uuid", "/en/shop/not-a-uuid"],
  ])("for %s, without reading anything", async (_label, redirect) => {
    expect(await signUpProductFor(redirect)).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("for a product nobody can read", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await signUpProductFor(`/en/shop/${PRODUCT_ID}`)).toBeUndefined();
  });

  // Decided by the product row, never by the URL: the same two exclusions the
  // enrolment reports apply.
  it.each([
    ["a municipality club", { product_type: "municipality_club" }],
    ["a product invoiced off-platform", { billing_mode: "external_contract" }],
  ])("for %s", async (_label, overrides) => {
    mockMaybeSingle.mockResolvedValue({
      data: productRow(overrides),
      error: null,
    });

    expect(await signUpProductFor(`/en/shop/${PRODUCT_ID}`)).toBeUndefined();
  });

  it("for a read that fails, and logs it", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });

    expect(await signUpProductFor(`/en/shop/${PRODUCT_ID}`)).toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("for a read that throws", async () => {
    mockMaybeSingle.mockRejectedValue(new Error("network down"));

    expect(await signUpProductFor(`/en/shop/${PRODUCT_ID}`)).toBeUndefined();
  });
});
