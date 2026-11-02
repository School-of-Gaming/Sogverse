import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ============================================================================
 * What a sign-up set out to reach: the intent a new profile stores.
 * ============================================================================
 *
 * The value arrives from the registration body, so a client can send anything.
 * Pinned here: only a same-origin product page, municipality club page or
 * landing page — in any locale's slug — is read at all; the kind comes from the
 * row, never the URL; and every other answer, a failed read included, is "no
 * intent" rather than an error.
 */

const PRODUCT_ID = "0f8b6c1e-3c2a-4d5e-9f60-7a8b9c0d1e2f";
const PAGE_ID = "3d2c1b0a-9f8e-4d7c-8b6a-5f4e3d2c1b0a";

const mockFrom = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();

/** A query builder whose filters chain and record themselves. */
function builder() {
  const query = {
    eq: (...args: unknown[]) => {
      mockEq(...args);
      return query;
    },
    maybeSingle: () => mockMaybeSingle(),
  };
  return query;
}

vi.mock("@/lib/supabase/anon", () => ({
  createAnonClient: () => ({
    from: (table: string) => {
      mockFrom(table);
      return { select: () => builder() };
    },
  }),
}));

import { resolveSignUpIntent, signUpTargetFrom } from "@/lib/sign-up-intent.server";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("signUpTargetFrom — the page a redirect names, by shape", () => {
  it("reads a shop product page in a translated slug, ignoring the query", () => {
    expect(signUpTargetFrom(`/fi/kauppa/${PRODUCT_ID}?x=1#top`)).toEqual({
      kind: "product_page",
      via: "shop",
      productId: PRODUCT_ID,
    });
  });

  it("reads a municipality club page", () => {
    expect(signUpTargetFrom(`/sv/skolor/helsingfors/${PRODUCT_ID}`)).toEqual({
      kind: "product_page",
      via: "schools",
      productId: PRODUCT_ID,
    });
  });

  it("reads a landing page with the locale its slug lives in", () => {
    expect(signUpTargetFrom("/fi/tutustu/minecraft-kerho")).toEqual({
      kind: "landing_page",
      locale: "fi",
      idOrSlug: "minecraft-kerho",
    });
  });

  it.each([
    undefined,
    "",
    "/en/shop",
    "/en/shop/not-a-uuid",
    `/en/discover/${PAGE_ID}/preview`,
    "/en/parent",
    `https://evil.example/en/shop/${PRODUCT_ID}`,
    `//evil.example/en/shop/${PRODUCT_ID}`,
  ])("names nothing for %s", (redirect) => {
    expect(signUpTargetFrom(redirect)).toBeNull();
  });
});

describe("resolveSignUpIntent — decided by the row", () => {
  it("names a product by its id", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { id: PRODUCT_ID, product_type: "consumer_club" },
      error: null,
    });

    expect(await resolveSignUpIntent(`/en/shop/${PRODUCT_ID}`)).toEqual({
      kind: "product",
      id: PRODUCT_ID,
    });
    expect(mockFrom).toHaveBeenCalledWith("products");
    expect(mockEq).toHaveBeenCalledWith("id", PRODUCT_ID);
  });

  // The kind is the product's own type: a municipality club reached through a
  // bare shop link is still a municipality club.
  it("names a municipality club by its type, whichever page led there", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { id: PRODUCT_ID, product_type: "municipality_club" },
      error: null,
    });

    expect(await resolveSignUpIntent(`/en/shop/${PRODUCT_ID}`)).toEqual({
      kind: "municipality_club",
      id: PRODUCT_ID,
    });
  });

  it("names nothing for a product the public cannot read", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    expect(await resolveSignUpIntent(`/en/shop/${PRODUCT_ID}`)).toBeNull();
  });

  it("names a live landing page at its id", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { page_id: PAGE_ID }, error: null });

    expect(await resolveSignUpIntent(`/en/discover/${PAGE_ID}`)).toEqual({
      kind: "landing_page",
      id: PAGE_ID,
    });
    expect(mockFrom).toHaveBeenCalledWith("landing_page_publications");
  });

  it("names a live landing page at its slug, in the slug's own locale", async () => {
    mockMaybeSingle.mockResolvedValue({ data: { page_id: PAGE_ID }, error: null });

    expect(await resolveSignUpIntent("/fi/tutustu/minecraft-kerho")).toEqual({
      kind: "landing_page",
      id: PAGE_ID,
    });
    expect(mockFrom).toHaveBeenCalledWith("landing_page_publication_translations");
    expect(mockEq).toHaveBeenCalledWith("locale", "fi");
    expect(mockEq).toHaveBeenCalledWith("slug", "minecraft-kerho");
  });

  it("reads nothing for a page that is no sign-up target", async () => {
    expect(await resolveSignUpIntent("/en/parent")).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("answers no intent rather than throwing when the read fails", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });

    expect(await resolveSignUpIntent(`/en/shop/${PRODUCT_ID}`)).toBeNull();
  });
});
