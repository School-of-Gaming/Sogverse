import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The product a registration form's `sign_up` names: the server lead's twin,
 * so it must name exactly the product the lead would — an advertised shop
 * product page's, unpriced — and nothing in any other case. And it must never
 * throw, because it sits inside the registration's own submit handler.
 */

const armed = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/gtm", () => ({ isGtmArmed: () => armed.value }));

const read = vi.hoisted(() => ({
  from: vi.fn(),
  eq: vi.fn(),
  result: { data: null as unknown, error: null as unknown },
}));
vi.mock("@/lib/supabase/client", () => ({
  getClient: () => ({
    from: (table: string) => {
      read.from(table);
      return {
        select: () => ({
          eq: (column: string, value: string) => {
            read.eq(column, value);
            return { maybeSingle: () => Promise.resolve(read.result) };
          },
        }),
      };
    },
  }),
}));

import { gtmSignUpProduct } from "@/lib/gtm-sign-up";

const PRODUCT_ID = "8f0c1c55-6b0e-4a43-9d1a-2f4b8c7e9a10";

const ROBLOX_CLUB = {
  id: PRODUCT_ID,
  product_type: "consumer_club",
  billing_mode: "paid",
  topic: "roblox_studio",
  product_translations: [{ locale: "en", name: "Roblox Studio Club" }],
  product_prices: [{ currency: "eur", price_cents: 4900 }],
};

beforeEach(() => {
  armed.value = true;
  read.result = { data: ROBLOX_CLUB, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("gtmSignUpProduct", () => {
  it("names an advertised shop product unpriced, as a lead names it", async () => {
    await expect(gtmSignUpProduct(`/fi/kauppa/${PRODUCT_ID}`)).resolves.toEqual({
      items: [
        {
          item_id: PRODUCT_ID,
          item_name: "Roblox Studio Club",
          item_category: "roblox_studio",
          quantity: 1,
        },
      ],
    });
    expect(read.eq).toHaveBeenCalledWith("id", PRODUCT_ID);
  });

  it("reads nothing when no container is coming to take the push", async () => {
    armed.value = false;

    await expect(gtmSignUpProduct(`/shop/${PRODUCT_ID}`)).resolves.toBeNull();
    expect(read.from).not.toHaveBeenCalled();
  });

  it.each([
    ["no redirect", null],
    ["a page that is not a product", "/roblox"],
    ["a school listing rather than the shop", `/schools/helsinki/${PRODUCT_ID}`],
    ["a redirect off the site", `https://evil.test/shop/${PRODUCT_ID}`],
  ])("names nothing and reads nothing for %s", async (_label, redirect) => {
    await expect(gtmSignUpProduct(redirect)).resolves.toBeNull();
    expect(read.from).not.toHaveBeenCalled();
  });

  it("names nothing for a product we do not advertise", async () => {
    read.result = {
      data: { ...ROBLOX_CLUB, product_type: "municipality_club" },
      error: null,
    };

    await expect(gtmSignUpProduct(`/shop/${PRODUCT_ID}`)).resolves.toBeNull();
  });

  it("names nothing, and throws nothing, when the read fails", async () => {
    read.result = { data: null, error: new Error("network down") };

    await expect(gtmSignUpProduct(`/shop/${PRODUCT_ID}`)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
