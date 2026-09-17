import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { GET as getProducts } from "@/app/api/partner/v1/products/route";
import { GET as getFamilies } from "@/app/api/partner/v1/families/route";
import { GET as getEnrolments } from "@/app/api/partner/v1/enrolments/route";
import { GET as getSessions } from "@/app/api/partner/v1/sessions/route";
import { GET as getFeedback } from "@/app/api/partner/v1/feedback/route";
import { GET as getRobloxResearch } from "@/app/api/partner/v1/roblox-research/route";
import { GET as getTraffic } from "@/app/api/partner/v1/traffic/route";
import { GET as getCampaigns } from "@/app/api/partner/v1/campaigns/route";
import * as catchAll from "@/app/api/partner/[...path]/route";
import {
  CAMPAIGN_MINIMUM_COUNT,
  partnerCampaignsResponse,
} from "@/services/partner/partner.contracts";
import { requestedUrl, type FetchMock } from "../../mocks/postgrest-fetch";
import {
  PARTNER_TEST_KEY,
  emptyTables,
  partnerRequest,
  postgrestTables,
} from "../../mocks/partner-api";

// --- Mocks ---
//
// The resources read the database through the service-role factory and
// `/traffic` reads Vercel Web Analytics. Nothing in this file is about what
// either returns — every case here is decided before a read, or is indifferent
// to it — but a route must never reach a real database or the network from a
// test, so both are replaced: every table and every Vercel query answers empty,
// and any other fetch is refused.

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

// `/traffic` caches its answer in Next's data cache, which only exists inside a
// running Next server. Nothing here is about caching (its own suite is), so the
// cache is a pass-through.
vi.mock("next/cache", () => ({
  unstable_cache:
    <A extends unknown[], R>(body: (...args: A) => Promise<R>) =>
    (...args: A) =>
      body(...args),
}));

// --- Helpers ---

type Handler = (request: Request) => Response | Promise<Response>;

/**
 * One row per documented resource, with one representative malformed
 * parameter. Between them the rows exercise a bad enum, a bad limit, a bad uuid,
 * a bad date shape, a date that is not a day and a month that is not a month,
 * so every validator in the contract is executed.
 *
 * This file holds what the eight resources share — the gate, validation, the
 * error envelope and its headers, and the catch-all — as a table, because the
 * partner integrates against "they all behave alike" and a per-resource copy
 * would not say so. What each resource answers lives in its own suite beside
 * this one (`partner-<resource>.test.ts`).
 */
const ROUTES: readonly {
  path: string;
  handler: Handler;
  badQuery: string;
  badParam: string;
}[] = [
  { path: "products", handler: getProducts, badQuery: "?status=archived", badParam: "status" },
  { path: "families", handler: getFamilies, badQuery: "?limit=501", badParam: "limit" },
  {
    path: "enrolments",
    handler: getEnrolments,
    badQuery: "?parent_id=not-a-uuid",
    badParam: "parent_id",
  },
  { path: "sessions", handler: getSessions, badQuery: "?from=19-10-2026", badParam: "from" },
  {
    path: "feedback",
    handler: getFeedback,
    badQuery: "?participant_id=abc",
    badParam: "participant_id",
  },
  {
    path: "roblox-research",
    handler: getRobloxResearch,
    // Shaped like a date and not a day: the regex alone would pass it.
    badQuery: "?to=2026-02-31",
    badParam: "to",
  },
  { path: "traffic", handler: getTraffic, badQuery: "?page=blog", badParam: "page" },
  {
    path: "campaigns",
    handler: getCampaigns,
    // Shaped like a month and not a month: the shape alone would pass it.
    badQuery: "?from=2026-13",
    badParam: "from",
  },
];

/** The six resources that return records; `/traffic` and `/campaigns` return aggregates. */
const AGGREGATE_PATHS = ["traffic", "campaigns"];
const LIST_ROUTES = ROUTES.filter((route) => !AGGREGATE_PATHS.includes(route.path));

/** The resources that take a `from`/`to` window of days; `/campaigns` takes months. */
const RANGE_PATHS = ["sessions", "feedback", "roblox-research", "traffic"];
const RANGE_ROUTES = ROUTES.filter((route) => RANGE_PATHS.includes(route.path));

const cases = ROUTES.map((route) => [route.path, route] as const);
const listCases = LIST_ROUTES.map((route) => [route.path, route] as const);
const rangeCases = RANGE_ROUTES.map((route) => [route.path, route] as const);

function request(path: string, query = "", authorization?: string | null): Request {
  return partnerRequest(`v1/${path}`, { query, authorization });
}

const CATCH_ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

// --- Tests ---

describe("the Lynx Educate partner API", () => {
  beforeEach(() => {
    vi.stubEnv("LYNX_PARTNER_API_KEY", PARTNER_TEST_KEY);
    // Configured, so a resource that checks its own configuration before or
    // after validating cannot turn a validation case into a 500.
    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "test-vercel-token");
    vi.stubEnv("VERCEL_TEAM_ID", "team_test");
    vi.stubEnv("VERCEL_PROJECT_ID", "prj_test");
    db.fetch = postgrestTables(emptyTables);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        requestedUrl(input).hostname === "api.vercel.com"
          ? new Response(JSON.stringify({ data: [] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          : Promise.reject(new Error("the network is not reachable from this suite")),
      ),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    db.fetch = undefined;
  });

  // --- Auth ---

  describe("authentication", () => {
    it.each(cases)("%s answers 500 when the key is not configured", async (_path, route) => {
      vi.stubEnv("LYNX_PARTNER_API_KEY", "");
      const response = await route.handler(request(route.path));
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error.code).toBe("server_misconfigured");
    });

    it.each(cases)("%s answers 401 with no Authorization header", async (_path, route) => {
      const response = await route.handler(request(route.path, "", null));
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe("unauthorized");
    });

    it.each(cases)("%s answers 401 to a non-Bearer header", async (_path, route) => {
      const response = await route.handler(
        request(route.path, "", `Basic ${PARTNER_TEST_KEY}`),
      );
      expect(response.status).toBe(401);
    });

    it.each(cases)("%s answers 401 to a wrong key of a different length", async (_path, route) => {
      // Rejected by the length guard, before timingSafeEqual is reached.
      const response = await route.handler(request(route.path, "", "Bearer wrong-key"));
      expect(response.status).toBe(401);
    });

    it.each(cases)("%s answers 401 to a wrong key of the SAME length", async (_path, route) => {
      // The case that actually reaches timingSafeEqual — every other auth case
      // stops at the length guard, so without this the constant-time compare is
      // never executed and reordering the two could go unnoticed.
      const response = await route.handler(
        request(route.path, "", `Bearer ${PARTNER_TEST_KEY.slice(0, -1)}X`),
      );
      expect(response.status).toBe(401);
    });

    it.each(cases)("%s accepts a lowercase scheme", async (_path, route) => {
      // RFC 7235 makes the scheme case-insensitive; refusing `bearer` would be
      // our bug presented as the partner's. What the resource then answers is
      // its own suite's business — here it only has to get past the gate.
      const response = await route.handler(
        request(route.path, "", `bearer ${PARTNER_TEST_KEY}`),
      );
      expect(response.status).not.toBe(401);
    });

    it.each(cases)("%s answers 401 to a Bearer with no token", async (_path, route) => {
      const response = await route.handler(request(route.path, "", "Bearer "));
      expect(response.status).toBe(401);
    });

    it.each(cases)("%s refuses a bad key before reading the query", async (_path, route) => {
      // Auth precedes validation, so a caller without the key cannot probe the
      // input handling by reading which parameter was rejected.
      const response = await route.handler(
        request(route.path, route.badQuery, "Bearer wrong-key"),
      );
      expect(response.status).toBe(401);
    });

    it.each(cases)("%s reads nothing for a caller without the key", async (_path, route) => {
      await route.handler(request(route.path, "", null));
      expect(db.fetch).not.toHaveBeenCalled();
    });
  });

  // --- Validation ---

  describe("query validation", () => {
    it.each(cases)("%s answers 400 to a malformed parameter", async (_path, route) => {
      const response = await route.handler(request(route.path, route.badQuery));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("invalid_query");
      expect(body.error.message).toContain(route.badParam);
    });

    it.each(listCases)("%s rejects a limit above 500", async (_path, route) => {
      expect((await route.handler(request(route.path, "?limit=501"))).status).toBe(400);
    });

    it.each(listCases)("%s rejects a non-numeric limit", async (_path, route) => {
      expect((await route.handler(request(route.path, "?limit=many"))).status).toBe(400);
    });

    it.each(rangeCases)("%s rejects a reversed date range", async (_path, route) => {
      // A reversed range is empty, so accepting it would answer a typo with a
      // confident, permanently empty pull — the one failure a scheduled sync
      // would not notice.
      const response = await route.handler(
        request(route.path, "?from=2026-10-31&to=2026-10-01"),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.message).toContain("from");
      expect(body.error.message).toContain("to");
    });

    it("rejects a product_id on /traffic asking for another kind of page", async () => {
      const response = await getTraffic(
        request("traffic", "?page=landing&product_id=5a1f8e1c-1b0e-4a3e-9a9c-2c9a4d8f0b11"),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.message).toContain("product_id");
      expect(body.error.message).toContain("page");
    });

    it("rejects a reversed month range on /campaigns", async () => {
      const response = await getCampaigns(request("campaigns", "?from=2026-10&to=2026-09"));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.message).toContain("from");
    });

    it("refuses a day where /campaigns takes a month", async () => {
      // Months are the privacy property, not a formatting preference: a day
      // range would let two answers be differenced down to one family.
      const response = await getCampaigns(request("campaigns", "?from=2026-09-01"));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.message).toContain("from");
    });

    it.each(cases)("%s reads nothing for a malformed query", async (_path, route) => {
      await route.handler(request(route.path, route.badQuery));
      expect(db.fetch).not.toHaveBeenCalled();
    });
  });

  // --- Unknown paths ---

  describe("an unknown path", () => {
    it.each(CATCH_ALL_METHODS)(
      "answers %s with not_found in the envelope",
      async (method) => {
        const response = await catchAll[method](
          partnerRequest("v1/lessons", { method }),
        );
        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body).toEqual({
          error: { code: "not_found", message: expect.stringContaining("/api/partner/v1/lessons") },
        });
      },
    );

    it.each([
      ["a resource that does not exist", "v1/lessons"],
      ["a version that does not exist", "v2/products"],
      ["a path below a real resource", "v1/products/5a1f8e1c-1b0e-4a3e-9a9c-2c9a4d8f0b11"],
      ["the version prefix alone", "v1"],
    ])("answers 404 to %s", async (_label, path) => {
      const response = await catchAll.GET(partnerRequest(path));
      expect(response.status).toBe(404);
    });

    it("checks the key before admitting nothing lives there", async () => {
      // A 404 to a caller without the key would let anyone map the surface by
      // the difference between 401 and 404.
      const response = await catchAll.GET(
        partnerRequest("v1/lessons", { authorization: null }),
      );
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe("unauthorized");
    });

    it("answers 500 rather than 404 when the key is not configured", async () => {
      vi.stubEnv("LYNX_PARTNER_API_KEY", "");
      const response = await catchAll.GET(partnerRequest("v1/lessons"));
      expect(response.status).toBe(500);
    });

    it("forbids caching the refusal", async () => {
      const response = await catchAll.GET(partnerRequest("v1/lessons"));
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    });
  });

  // --- The contract's own guards ---

  describe("the campaign contract", () => {
    // The contract is what stops a filled-in resource from leaking a small
    // count or another partner's campaign, so it is tested as the guard it is,
    // independently of what the route computes.
    const answer = (entry: Record<string, unknown>) => ({
      range: { from: "2026-09", to: "2026-09" },
      minimum_count: CAMPAIGN_MINIMUM_COUNT,
      campaigns: [
        {
          utm_campaign: "lynx-autumn-a",
          accounts_created: 42,
          children_added: 51,
          children_eligible: 38,
          enrolled: null,
          ...entry,
        },
      ],
    });

    it("accepts counts at the minimum and withheld counts", () => {
      expect(() =>
        partnerCampaignsResponse.parse(answer({ enrolled: CAMPAIGN_MINIMUM_COUNT })),
      ).not.toThrow();
      expect(() => partnerCampaignsResponse.parse(answer({}))).not.toThrow();
    });

    it("refuses a count under the minimum, zero included", () => {
      for (const count of [0, 1, CAMPAIGN_MINIMUM_COUNT - 1]) {
        expect(() =>
          partnerCampaignsResponse.parse(answer({ enrolled: count })),
        ).toThrow();
      }
    });

    it("refuses a campaign that is not Lynx's, whatever its letter case", () => {
      expect(() =>
        partnerCampaignsResponse.parse(answer({ utm_campaign: "Lynx-Autumn" })),
      ).not.toThrow();
      expect(() =>
        partnerCampaignsResponse.parse(answer({ utm_campaign: "rblx-launch" })),
      ).toThrow();
    });
  });

  // --- Caching ---

  it.each(cases)("%s forbids caching a refusal", async (_path, route) => {
    // The body is scoped to the key that asked for it, so nothing between us
    // and Lynx may keep a copy — of an answer, or of a refusal.
    const unauthorized = await route.handler(request(route.path, "", null));
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("cache-control")).toBe("private, no-store");

    const invalid = await route.handler(request(route.path, route.badQuery));
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("cache-control")).toBe("private, no-store");
  });
});
