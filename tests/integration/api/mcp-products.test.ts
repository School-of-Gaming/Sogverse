import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_TEST_ORIGIN as ORIGIN, callTool, resultText } from "../../helpers/mcp";

/**
 * **The product tool, through the real endpoint.** The real gate, SDK and tool
 * module, with the products and participations services mocked: what is under
 * test is that the tool pages the admin product list — its filters and its
 * keyset cursor, on the admin's token — hands each product over with what an
 * AI app needs to write about it and pick it for a landing page, says whether
 * a products section shows it by asking the listing over every product type,
 * the read the section draws by, and passes on the raw seat counts and what the
 * shop's own schedule formatter and registration state make of the product.
 * Those two functions' own rules are their own tests'; here they are only
 * shown to reach the answer unchanged.
 */

const mockGetClaims = vi.fn();
const mockMaybeSingle = vi.fn();
// The holiday breaks are read through their real service, so the RPC it calls
// is the one read mocked at the client.
const mockRpc = vi.fn();
const bearerClient = {
  auth: { getClaims: mockGetClaims },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  rpc: mockRpc,
};
vi.mock("@/lib/supabase/bearer", () => ({ createBearerClient: () => bearerClient }));

const products = { getAdminListPage: vi.fn(), listVisibleListingAmong: vi.fn() };
vi.mock("@/services/products/products.service", () => ({
  ADMIN_PRODUCT_LIST_PAGE_SIZE: 25,
  ProductsService: vi.fn(() => products),
}));

const participations = { getParticipationCounts: vi.fn() };
vi.mock("@/services/participations/participations.service", () => ({
  ParticipationsService: vi.fn(() => participations),
}));

/** The counts read's answer: every id asked about, none taken unless given. */
function countsFor(taken: Partial<Record<string, { active: number; waitlist?: number }>> = {}) {
  return (ids: string[]) =>
    Promise.resolve(
      ids.map((productId) => ({
        productId,
        activeCount: taken[productId]?.active ?? 0,
        waitlistCount: taken[productId]?.waitlist ?? 0,
        myGamerStates: {},
      })),
    );
}

// The page link names its locale's own address.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

const { POST } = await import("@/app/api/mcp/route");

// The instant every call is read at: after the club starts, before the events.
const NOW = new Date("2026-10-27T12:00:00Z");

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
    delivery_mode: "online",
    is_visible: true,
    spoken_language_code: "en",
    for_gamers: true,
    for_parents: false,
    min_age: 8,
    max_age: 12,
    seat_count: null,
    waitlist_enabled: true,
    registration_opens_at: "2026-08-01T09:00:00+00:00",
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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
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
  participations.getParticipationCounts.mockReset();
  participations.getParticipationCounts.mockImplementation(countsFor());
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
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
          delivery_mode: "in_person",
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
    // The seat counts are read once, for the whole page.
    expect(participations.getParticipationCounts).toHaveBeenCalledTimes(1);
    expect(participations.getParticipationCounts).toHaveBeenCalledWith([CLUB, CAMP, MUNI, HIDDEN]);
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      total: 4,
      products: [
        {
          productId: CLUB,
          names: [
            { locale: "en", name: "Roblox club", shortDescription: "Weekly." },
            { locale: "fi", name: "Roblox-kerho", shortDescription: "" },
          ],
          type: "consumer_club",
          topic: "roblox_studio",
          deliveryMode: "online",
          location: null,
          holidayBreaks: [],
          spokenLanguage: "en",
          forGamers: true,
          forParents: false,
          minAge: 8,
          maxAge: 12,
          startDate: "2026-09-01",
          endDate: null,
          timezone: "Europe/Helsinki",
          slots: [],
          schedule: { kind: "tbd" },
          registrationOpensAt: "2026-08-01T09:00:00+00:00",
          billingMode: "free",
          prices: [],
          seats: { capacity: null, taken: 0, waitlisted: 0, waitlistEnabled: true },
          registration: { kind: "open", seatCount: null, seatsLeft: null, waitlistEnabled: true },
          pageLink: `${ORIGIN}/en/shop/${CLUB}`,
          publiclyListed: true,
          listing: "listed",
        },
        expect.objectContaining({
          productId: CAMP,
          type: "camp",
          deliveryMode: "in_person",
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
          // An online municipality club names the area it serves.
          location: { kind: "muni", name: "Espoo" },
          listing: "listed",
        }),
        expect.objectContaining({ productId: HIDDEN, publiclyListed: false, listing: "hidden" }),
      ],
      nextCursor: null,
    });
  });

  it("tells two same-named products on one date apart by their raw slots and the shop's schedule, in the product's own zone", async () => {
    const early = "c3000000-0000-4000-8000-000000000011";
    const late = "c3000000-0000-4000-8000-000000000012";
    const trial = (id: string, startTime: string) =>
      adminRow(id, {
        product_type: "event",
        start_date: "2026-11-07",
        end_date: "2026-11-07",
        timezone: "Europe/London",
        product_translations: [{ locale: "en", name: "Trial session", short_description: "Try it." }],
        schedule_slots: [{ weekday: 5, start_time: startTime, duration_minutes: 60 }],
      });
    products.getAdminListPage.mockResolvedValue({
      total: 2,
      rows: [trial(early, "10:00:00"), trial(late, "11:15:00")],
    });
    products.listVisibleListingAmong.mockResolvedValue([]);

    const result = await tool();

    const names = [{ locale: "en", name: "Trial session", shortDescription: "Try it." }];
    const shown = (start: string, end: string) => ({
      kind: "single",
      tzAbbrev: "GMT",
      tzAdjusted: false,
      date: "7 Nov 2026",
      weekday: "Saturday",
      time: { start, end },
    });
    expect(result.structuredContent?.products).toEqual([
      expect.objectContaining({
        productId: early,
        names,
        startDate: "2026-11-07",
        slots: [{ weekday: 5, startTime: "10:00:00", durationMinutes: 60 }],
        schedule: shown("10:00", "11:00"),
      }),
      expect.objectContaining({
        productId: late,
        names,
        startDate: "2026-11-07",
        slots: [{ weekday: 5, startTime: "11:15:00", durationMinutes: 60 }],
        schedule: shown("11:15", "12:15"),
      }),
    ]);
  });

  it("names an in-person product's site with the place it sits in, and no place where it is filed under none", async () => {
    const unfiled = "c3000000-0000-4000-8000-000000000031";
    products.getAdminListPage.mockResolvedValue({
      total: 2,
      rows: [
        adminRow(unfiled, {
          delivery_mode: "in_person",
          locations: {
            id: "d1000000-0000-4000-8000-000000000003",
            name: "Youth Centre",
            name_i18n: null,
            type: "site",
            parent: null,
          },
        }),
        adminRow(CAMP, {
          product_type: "camp",
          delivery_mode: "in_person",
          locations: {
            id: "d1000000-0000-4000-8000-000000000002",
            name: "Sello Library",
            name_i18n: null,
            type: "site",
            parent: ESPOO,
          },
        }),
      ],
    });
    products.listVisibleListingAmong.mockResolvedValue([]);

    const result = await tool();

    expect(result.structuredContent?.products).toEqual([
      expect.objectContaining({ location: { kind: "site", site: "Youth Centre", parent: null } }),
      expect.objectContaining({ location: { kind: "site", site: "Sello Library", parent: "Espoo" } }),
    ]);
  });

  it("passes on a running club's holiday breaks as the service returns them, read over the page's span", async () => {
    products.getAdminListPage.mockResolvedValue({
      total: 1,
      rows: [adminRow(CLUB, { end_date: "2026-12-20" })],
    });
    products.listVisibleListingAmong.mockResolvedValue([]);
    mockRpc.mockResolvedValue({
      data: [
        {
          id: "b1000000-0000-4000-8000-000000000001",
          start_date: "2026-12-14",
          end_date: "2026-12-18",
          names: [
            { locale: "en", name: "Christmas break" },
            { locale: "fi", name: "Joululoma" },
          ],
          withdrawn_sessions: [
            {
              session_date: "2026-12-16",
              starts_at: "2026-12-16T15:00:00+00:00",
              ends_at: "2026-12-16T16:00:00+00:00",
            },
          ],
        },
      ],
      error: null,
    });

    const result = await tool();

    // From today in the club's zone to the end of its term.
    expect(mockRpc).toHaveBeenCalledWith("holiday_breaks_document", {
      p_product_id: CLUB,
      p_from: "2026-10-27",
      p_to: "2026-12-20",
    });
    expect(result.structuredContent?.products).toEqual([
      expect.objectContaining({
        productId: CLUB,
        holidayBreaks: [
          {
            id: "b1000000-0000-4000-8000-000000000001",
            startDate: "2026-12-14",
            endDate: "2026-12-18",
            names: [
              { locale: "en", name: "Christmas break" },
              { locale: "fi", name: "Joululoma" },
            ],
            withdrawnSessions: [
              {
                date: "2026-12-16",
                // The service's instants, as the wire carries them.
                startsAt: "2026-12-16T15:00:00.000Z",
                endsAt: "2026-12-16T16:00:00.000Z",
                cancelled: false,
              },
            ],
          },
        ],
      }),
    ]);
  });

  it("reads no holiday breaks for a camp or an event", async () => {
    products.getAdminListPage.mockResolvedValue({
      total: 2,
      rows: [
        adminRow(CAMP, { product_type: "camp", start_date: "2026-11-02", end_date: "2026-11-06" }),
        adminRow(HIDDEN, { product_type: "event", start_date: "2026-11-07", end_date: "2026-11-07" }),
      ],
    });
    products.listVisibleListingAmong.mockResolvedValue([]);

    const result = await tool();

    expect(mockRpc).not.toHaveBeenCalled();
    expect(result.structuredContent?.products).toEqual([
      expect.objectContaining({ productId: CAMP, holidayBreaks: [] }),
      expect.objectContaining({ productId: HIDDEN, holidayBreaks: [] }),
    ]);
  });

  it("passes on the raw seat counts, and the shop's sign-up state over them", async () => {
    const open = "c3000000-0000-4000-8000-000000000021";
    const full = "c3000000-0000-4000-8000-000000000022";
    const started = "c3000000-0000-4000-8000-000000000023";
    products.getAdminListPage.mockResolvedValue({
      total: 3,
      rows: [
        adminRow(open, { seat_count: 10 }),
        adminRow(full, { seat_count: 10, waitlist_enabled: false }),
        // A camp already underway takes no more sign-ups.
        adminRow(started, {
          product_type: "camp",
          seat_count: 10,
          start_date: "2026-10-26",
          end_date: "2026-10-30",
        }),
      ],
    });
    products.listVisibleListingAmong.mockResolvedValue([]);
    participations.getParticipationCounts.mockImplementation(
      countsFor({
        [open]: { active: 9 },
        [full]: { active: 10, waitlist: 3 },
        [started]: { active: 4 },
      }),
    );

    const result = await tool();

    expect(result.structuredContent?.products).toEqual([
      expect.objectContaining({
        productId: open,
        seats: { capacity: 10, taken: 9, waitlisted: 0, waitlistEnabled: true },
        registration: { kind: "open", seatCount: 10, seatsLeft: 1, waitlistEnabled: true },
      }),
      expect.objectContaining({
        productId: full,
        seats: { capacity: 10, taken: 10, waitlisted: 3, waitlistEnabled: false },
        registration: { kind: "full_closed", seatCount: 10 },
      }),
      expect.objectContaining({
        productId: started,
        seats: { capacity: 10, taken: 4, waitlisted: 0, waitlistEnabled: true },
        registration: { kind: "running_late", phase: "underway" },
      }),
    ]);
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
