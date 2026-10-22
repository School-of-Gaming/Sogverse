import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TEST_ORIGIN as ORIGIN, callTool, resultText } from "../../helpers/mcp";

/**
 * **The product tool, through the real endpoint.** The real gate, SDK and tool
 * module, with the products service mocked: what is under test is that the
 * tool pages the admin product list — its filters and its keyset cursor, on
 * the admin's token — hands each product over with what an AI app needs to
 * pick it for a landing page, and says whether a products section shows it by
 * asking the listing over every product type, the read the section draws by.
 */

const mockGetClaims = vi.fn();
const mockMaybeSingle = vi.fn();
const bearerClient = {
  auth: { getClaims: mockGetClaims },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
};
vi.mock("@/lib/supabase/bearer", () => ({ createBearerClient: () => bearerClient }));

const products = { getAdminListPage: vi.fn(), listVisibleListingAmong: vi.fn() };
vi.mock("@/services/products/products.service", () => ({
  ADMIN_PRODUCT_LIST_PAGE_SIZE: 25,
  ProductsService: vi.fn(() => products),
}));

// The page link names its locale's own address.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

const { POST } = await import("@/app/api/mcp/route");

const SUPABASE_URL = "https://project.supabase.co";
const CLIENT_ID = "5b0a3f0e-1c55-4c43-8d2e-6a7f3f0f2a90";
const CLUB = "c3000000-0000-4000-8000-000000000001";
const CAMP = "c3000000-0000-4000-8000-000000000002";
const MUNI = "c3000000-0000-4000-8000-000000000003";
const HIDDEN = "c3000000-0000-4000-8000-000000000004";

/** An admin list row with the fields the tool reads, any of them overridden. */
function adminRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    created_at: "2026-10-01T10:00:00Z",
    product_type: "consumer_club",
    topic: "roblox_studio",
    is_remote: true,
    is_visible: true,
    start_date: "2026-09-01",
    end_date: null,
    timezone: "Europe/Helsinki",
    billing_mode: "free",
    product_translations: [{ locale: "en", name: `Product ${id.slice(-1)}`, short_description: "" }],
    product_prices: [],
    schedule_slots: [],
    locations: null,
    ...overrides,
  };
}

const ESPOO = {
  id: "d1000000-0000-4000-8000-000000000001",
  name: "Espoo",
  name_i18n: { sv: "Esbo" },
  type: "municipality",
  parent: null,
};

const tool = (args: Record<string, unknown> = {}) => callTool(POST, "list_products", args);

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
  products.getAdminListPage.mockReset();
  products.listVisibleListingAmong.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("list_products", () => {
  it("pages the admin list and says, by the listing, whether a products section shows each one", async () => {
    products.getAdminListPage.mockResolvedValue({
      total: 4,
      rows: [
        adminRow(CLUB, {
          product_translations: [
            { locale: "fi", name: "Roblox-kerho", short_description: "" },
            { locale: "en", name: "Roblox club", short_description: "Weekly." },
          ],
        }),
        adminRow(CAMP, {
          product_type: "camp",
          topic: "minecraft_java",
          is_remote: false,
          billing_mode: "paid",
          start_date: "2025-06-02",
          end_date: "2025-06-06",
          product_prices: [{ currency: "EUR", price_cents: 24900 }],
        }),
        adminRow(MUNI, { product_type: "municipality_club", locations: ESPOO }),
        adminRow(HIDDEN, { is_visible: false }),
      ],
    });
    // The listing holds the club and the municipality club.
    products.listVisibleListingAmong.mockResolvedValue([{ id: CLUB }, { id: MUNI }]);

    const result = await tool();

    expect(products.getAdminListPage).toHaveBeenCalledWith(
      {
        type: null,
        search: "",
        spokenLanguage: null,
        weekday: null,
        geduId: null,
        municipalityId: null,
      },
      { cursor: undefined },
    );
    const [types, ids] = products.listVisibleListingAmong.mock.calls[0];
    expect([...types].sort()).toEqual(["camp", "consumer_club", "event", "municipality_club"]);
    expect(ids).toEqual([CLUB, CAMP, MUNI, HIDDEN]);
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      total: 4,
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
          pageLink: `${ORIGIN}/en/shop/${CLUB}`,
          listing: "listed",
        },
        expect.objectContaining({
          productId: CAMP,
          type: "camp",
          online: false,
          startDate: "2025-06-02",
          endDate: "2025-06-06",
          billingMode: "paid",
          prices: [{ currency: "EUR", amountCents: 24900 }],
          pageLink: `${ORIGIN}/en/shop/${CAMP}`,
          listing: "ended",
        }),
        expect.objectContaining({
          productId: MUNI,
          type: "municipality_club",
          // Where its card on its town's schools page leads.
          pageLink: `${ORIGIN}/en/schools/espoo/${MUNI}`,
          listing: "listed",
        }),
        expect.objectContaining({ productId: HIDDEN, listing: "hidden" }),
      ],
      nextCursor: null,
    });
  });

  it("passes the filters through, and pages on with the cursor it handed out", async () => {
    const rows = Array.from({ length: 25 }, (_, n) =>
      adminRow(`c3000000-0000-4000-8000-${String(100 + n).padStart(12, "0")}`, {
        created_at: `2026-10-01T10:00:${String(59 - n).padStart(2, "0")}Z`,
      }),
    );
    products.getAdminListPage.mockResolvedValueOnce({ total: 30, rows });
    products.listVisibleListingAmong.mockResolvedValue([]);

    const first = await tool({ type: "camp", search: "  summer ", spokenLanguage: "fi", weekday: 2 });

    expect(products.getAdminListPage).toHaveBeenLastCalledWith(
      {
        type: "camp",
        search: "summer",
        spokenLanguage: "fi",
        weekday: 2,
        geduId: null,
        municipalityId: null,
      },
      { cursor: undefined },
    );
    expect(first.structuredContent).toMatchObject({ total: 30, nextCursor: expect.any(String) });
    const nextCursor = first.structuredContent?.nextCursor;

    products.getAdminListPage.mockResolvedValueOnce({ total: null, rows: rows.slice(0, 5) });
    const second = await tool({ type: "camp", cursor: nextCursor });

    const last = rows.at(-1);
    expect(products.getAdminListPage).toHaveBeenLastCalledWith(expect.anything(), {
      cursor: { createdAt: last?.created_at, id: last?.id },
    });
    // Only the first page says how many match.
    expect(second.structuredContent).not.toHaveProperty("total");
    expect(second.structuredContent).toMatchObject({ nextCursor: null });
  });

  it.each([
    ["one that does not decode", "not-a-cursor"],
    [
      "one that decodes but names no real row",
      Buffer.from(JSON.stringify({ createdAt: "yesterday", id: "x" })).toString("base64url"),
    ],
  ])("refuses a cursor it never handed out — %s — reading nothing", async (_, cursor) => {
    const result = await tool({ cursor });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/not one list_products handed out/);
    expect(products.getAdminListPage).not.toHaveBeenCalled();
  });

  it("answers a failed read with a generic line", async () => {
    products.getAdminListPage.mockRejectedValue(new Error("connection reset"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await tool();

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe("Sogverse could not read the products. Try again.");
    spy.mockRestore();
  });
});
