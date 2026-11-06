import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { GET } from "@/app/api/partner/v1/consent/route";
import {
  partnerConsentResponse,
  type PartnerConsentResponse,
} from "@/services/partner/partner.contracts";
import { requestedUrl, type FetchMock } from "../../mocks/postgrest-fetch";
import { PARTNER_TEST_KEY, partnerRequest, postgrestTables, readsOf } from "../../mocks/partner-api";

// --- Mocks ---

const db = vi.hoisted(() => ({ fetch: undefined as FetchMock | undefined }));

vi.mock("@/lib/supabase/admin", async () => {
  const { createFetchStubbedClient } = await import("../../mocks/postgrest-fetch");
  return {
    createAdminClient: () => {
      if (db.fetch === undefined) throw new Error("the database stub is not installed");
      return createFetchStubbedClient(db.fetch);
    },
  };
});

// --- Fixtures ---

const PRODUCT = "10000000-0000-4000-8000-000000000001";
const PRODUCT_2 = "10000000-0000-4000-8000-000000000002";
const UNANSWERED_PRODUCT = "10000000-0000-4000-8000-000000000003";
const SHOP_ONLY_PRODUCT = "10000000-0000-4000-8000-000000000009";

const PROGRAMME_PRODUCTS = [PRODUCT, PRODUCT_2, UNANSWERED_PRODUCT];

const NOW = new Date("2026-11-20T10:15:00Z");

/** What `consent_answer_totals` answers: one row per (page, answer), the non-marketing pages at null. */
const TOTALS = [
  { page: null, answer: "all", count: 400 },
  { page: null, answer: "none", count: 90 },
  { page: "/", answer: "all", count: 70 },
  { page: "/about", answer: "none", count: 3 },
  { page: "/discover/lapseni-on-pelaaja", answer: "all", count: 12 },
  { page: "/register", answer: "analytics_only", count: 2 },
  // The Roblox landing page, at its three format addresses.
  { page: "/roblox", answer: "all", count: 30 },
  { page: "/roblox", answer: "none", count: 8 },
  { page: "/roblox-all", answer: "all", count: 5 },
  { page: "/roblox-online", answer: "analytics_only", count: 4 },
  { page: "/roblox-online", answer: "marketing_only", count: 1 },
  { page: "/shop", answer: "none", count: 6 },
  { page: `/shop/${PRODUCT}`, answer: "all", count: 9 },
  { page: `/shop/${PRODUCT_2}`, answer: "marketing_only", count: 2 },
  // A product outside the Programme had answers; they are not reported.
  { page: `/shop/${SHOP_ONLY_PRODUCT}`, answer: "all", count: 50 },
];

type Totals = readonly { page: string | null; answer: string; count: number }[];

function tables(totals: Totals = TOTALS) {
  return postgrestTables({
    "rpc/consent_answer_totals": () => [...totals],
    product_required_consents: (url) =>
      url.searchParams.get("document_slug") === "eq.roblox-programme-terms"
        ? PROGRAMME_PRODUCTS.map((product_id) => ({ product_id }))
        : [],
  });
}

function request(query = ""): Request {
  return partnerRequest("v1/consent", { query });
}

async function read(query = ""): Promise<PartnerConsentResponse> {
  const response = await GET(request(query));
  expect(response.status).toBe(200);
  return partnerConsentResponse.parse(await response.json());
}

/** The arguments every call of the totals function was sent. */
function totalsArgs(): unknown[] {
  return (db.fetch?.mock.calls ?? [])
    .filter(([input]) => requestedUrl(input).pathname.endsWith("/rpc/consent_answer_totals"))
    .map(([, init]) => {
      const args: unknown = JSON.parse(String(init?.body ?? "null"));
      return args;
    });
}

// --- Tests ---

describe("GET /api/partner/v1/consent", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.stubEnv("LYNX_PARTNER_API_KEY", PARTNER_TEST_KEY);
    db.fetch = tables();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    db.fetch = undefined;
  });

  it("answers the landing page, the shop and each answered Programme product over the last 30 days", async () => {
    const body = await read();

    expect(body.range).toEqual({ from: "2026-10-22", to: "2026-11-20" });
    expect(totalsArgs()).toEqual([{ p_from: "2026-10-22", p_to: "2026-11-20" }]);
    expect(body.pages).toEqual([
      {
        page: "landing",
        product_id: null,
        answered: 48,
        // Every format address of the landing page counts as one page.
        answers: { all: 35, analytics_only: 4, marketing_only: 1, none: 8 },
      },
      {
        page: "shop",
        product_id: null,
        answered: 6,
        answers: { all: 0, analytics_only: 0, marketing_only: 0, none: 6 },
      },
      {
        page: "product",
        product_id: PRODUCT,
        answered: 9,
        answers: { all: 9, analytics_only: 0, marketing_only: 0, none: 0 },
      },
      {
        page: "product",
        product_id: PRODUCT_2,
        answered: 2,
        answers: { all: 0, analytics_only: 0, marketing_only: 2, none: 0 },
      },
    ]);
  });

  it("answers the landing page and the shop with zeros when nobody answered", async () => {
    db.fetch = tables([]);
    const body = await read("?from=2026-06-01&to=2026-06-30");
    expect(body.range).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    const zero = { all: 0, analytics_only: 0, marketing_only: 0, none: 0 };
    expect(body.pages).toEqual([
      { page: "landing", product_id: null, answered: 0, answers: zero },
      { page: "shop", product_id: null, answered: 0, answers: zero },
    ]);
  });

  it("asks for exactly the days named, inclusive at both ends", async () => {
    const body = await read("?from=2026-11-02&to=2026-11-02");
    expect(body.range).toEqual({ from: "2026-11-02", to: "2026-11-02" });
    expect(totalsArgs()).toEqual([{ p_from: "2026-11-02", p_to: "2026-11-02" }]);
  });

  it("answers a range reaching past today up to today", async () => {
    const body = await read("?from=2026-11-01&to=2030-01-01");
    expect(body.range).toEqual({ from: "2026-11-01", to: "2026-11-20" });
    expect(totalsArgs()).toEqual([{ p_from: "2026-11-01", p_to: "2026-11-20" }]);
  });

  it.each([
    ["a from after the to a default completed", "?from=2027-01-01", "from"],
    ["a range wholly after today", "?from=2027-01-01&to=2027-02-01", "from"],
  ])("answers 400 invalid_query for %s, naming the parameter, and reads nothing", async (_, query, parameter) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_query");
    expect(body.error.message.startsWith(`${parameter}:`)).toBe(true);
    expect(db.fetch).not.toHaveBeenCalled();
  });

  it("answers 500 internal_error when the database refuses, without quoting it", async () => {
    db.fetch = postgrestTables({ product_required_consents: () => [] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("consent_answer_totals");
  });

  it("reads the Programme through the scope, once", async () => {
    await read();
    expect(readsOf(db.fetch, "product_required_consents")).toHaveLength(1);
  });

  it("forbids caching the answer downstream", async () => {
    const response = await GET(request());
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  describe("the contract", () => {
    const answer = (entry: Record<string, unknown>) => ({
      range: { from: "2026-11-01", to: "2026-11-20" },
      pages: [
        {
          page: "landing",
          product_id: null,
          answered: 3,
          answers: { all: 1, analytics_only: 1, marketing_only: 0, none: 1 },
          ...entry,
        },
      ],
    });

    it("accepts an entry whose answered is its answers added together", () => {
      expect(() => partnerConsentResponse.parse(answer({}))).not.toThrow();
    });

    it("refuses an answered that is not the sum", () => {
      expect(() => partnerConsentResponse.parse(answer({ answered: 4 }))).toThrow();
    });

    it("refuses a missing answer or one the page does not name", () => {
      expect(() =>
        partnerConsentResponse.parse(
          answer({ answers: { all: 1, analytics_only: 1, none: 1 } }),
        ),
      ).toThrow();
      expect(() =>
        partnerConsentResponse.parse(
          answer({
            answers: { all: 1, analytics_only: 1, marketing_only: 0, none: 1, maybe: 0 },
          }),
        ),
      ).toThrow();
    });
  });
});
