import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TEST_ORIGIN as ORIGIN, callTool, resultText } from "../../helpers/mcp";
import { browseRow } from "../../mocks/product-browse-row";

/**
 * **The product tool, through the real endpoint.** The real gate, SDK and tool
 * module, with the products service mocked: what is under test is that the
 * tool reads the shop's own listing — the shop's three types, on the admin's
 * token — and hands each product over with what an AI app needs to pick it
 * for a landing page, and that its description says how picks go stale.
 */

const mockGetClaims = vi.fn();
const mockMaybeSingle = vi.fn();
const bearerClient = {
  auth: { getClaims: mockGetClaims },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
};
vi.mock("@/lib/supabase/bearer", () => ({ createBearerClient: () => bearerClient }));

const products = { listVisibleByTypes: vi.fn() };
vi.mock("@/services/products/products.service", () => ({
  ProductsService: vi.fn(() => products),
}));

// The shop link names its locale's own address.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

const { POST } = await import("@/app/api/mcp/route");

const SUPABASE_URL = "https://project.supabase.co";
const CLIENT_ID = "5b0a3f0e-1c55-4c43-8d2e-6a7f3f0f2a90";
const CLUB = "c3000000-0000-4000-8000-000000000001";
const CAMP = "c3000000-0000-4000-8000-000000000002";

const tool = () => callTool(POST, "list_shop_products", {});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  mockGetClaims.mockResolvedValue({
    data: {
      claims: {
        sub: "8f1c2a8e-6c1b-4a7e-9a52-2d0d3c6e9b11",
        email: "admin@example.com",
        iss: `${SUPABASE_URL}/auth/v1`,
        exp: 2_000_000_000,
        client_id: CLIENT_ID,
      },
    },
    error: null,
  });
  mockMaybeSingle.mockResolvedValue({ data: { role: "admin" }, error: null });
  products.listVisibleByTypes.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("list_shop_products", () => {
  it("lists the shop's listing with each product's names, type, dates, price and page", async () => {
    products.listVisibleByTypes.mockResolvedValue([
      browseRow(CLUB, {
        product_translations: [
          { locale: "fi", name: "Roblox-kerho", short_description: "" },
          { locale: "en", name: "Roblox club", short_description: "Weekly." },
        ],
      }),
      browseRow(CAMP, {
        name: "Summer camp",
        product_type: "camp",
        topic: "minecraft_java",
        is_remote: false,
        billing_mode: "paid",
        start_date: "2027-06-07",
        end_date: "2027-06-11",
        product_prices: [{ currency: "EUR", price_cents: 24900 }],
      }),
    ]);

    const result = await tool();

    expect(products.listVisibleByTypes).toHaveBeenCalledWith(
      expect.arrayContaining(["consumer_club", "camp", "event"]),
    );
    expect(products.listVisibleByTypes.mock.calls[0][0]).toHaveLength(3);
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      products: [
        {
          productId: CLUB,
          names: [
            { locale: "en", name: "Roblox club" },
            { locale: "fi", name: "Roblox-kerho" },
          ],
          type: "consumer_club",
          topic: "roblox_studio",
          online: true,
          startDate: "2026-09-01",
          endDate: null,
          timezone: "Europe/Helsinki",
          billingMode: "free",
          prices: [],
          shopLink: `${ORIGIN}/en/shop/${CLUB}`,
        },
        {
          productId: CAMP,
          names: [{ locale: "en", name: "Summer camp" }],
          type: "camp",
          topic: "minecraft_java",
          online: false,
          startDate: "2027-06-07",
          endDate: "2027-06-11",
          timezone: "Europe/Helsinki",
          billingMode: "paid",
          prices: [{ currency: "EUR", amountCents: 24900 }],
          shopLink: `${ORIGIN}/en/shop/${CAMP}`,
        },
      ],
    });
  });

  it("answers a failed read with a generic line", async () => {
    products.listVisibleByTypes.mockRejectedValue(new Error("connection reset"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await tool();

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe("Sogverse could not read the shop's products. Try again.");
    spy.mockRestore();
  });
});

