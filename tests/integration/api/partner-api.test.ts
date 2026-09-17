import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { z } from "zod";

import { GET as getProducts } from "@/app/api/partner/v1/products/route";
import { GET as getFamilies } from "@/app/api/partner/v1/families/route";
import { GET as getEnrolments } from "@/app/api/partner/v1/enrolments/route";
import { GET as getSessions } from "@/app/api/partner/v1/sessions/route";
import { GET as getFeedback } from "@/app/api/partner/v1/feedback/route";
import { GET as getRobloxResearch } from "@/app/api/partner/v1/roblox-research/route";
import { GET as getTraffic } from "@/app/api/partner/v1/traffic/route";
import {
  partnerEnrolmentsResponse,
  partnerFamiliesResponse,
  partnerFeedbackResponse,
  partnerProductsResponse,
  partnerRobloxResearchResponse,
  partnerSessionsResponse,
  partnerTrafficResponse,
} from "@/services/partner/partner.contracts";

// --- Constants ---

const API_KEY = "test-lynx-partner-key-32-chars-min";

// --- Helpers ---

function createRequest(path: string, query = "", apiKey?: string | null): Request {
  const url = `http://localhost:3000/api/partner/v1/${path}${query}`;
  const headers: Record<string, string> = {};
  // eslint-disable-next-line security/detect-possible-timing-attacks -- test helper, not an auth comparison; `apiKey !== null` just distinguishes "omit header" (null) from "use this value" (string)
  if (apiKey !== null) {
    headers["Authorization"] = apiKey ?? `Bearer ${API_KEY}`;
  }
  return new Request(url, { method: "GET", headers });
}

type Handler = (request: Request) => Response;

/**
 * One row per documented resource: the handler, the response schema the body
 * must satisfy, and one representative malformed parameter.
 *
 * The seven resources are the same route written seven times — same gate, same
 * parse, same empty answer — so the auth and envelope cases run as a table
 * against all of them. A per-resource file would be seven copies of one test
 * and would still not say that the seven behave alike, which is the property
 * the partner is integrating against. The malformed parameter differs per row
 * on purpose: between them they exercise a bad enum, a bad limit, a bad uuid
 * and two bad dates, so every validator in the contract is executed.
 */
const ROUTES: readonly {
  path: string;
  handler: Handler;
  response: z.ZodTypeAny;
  badQuery: string;
  badParam: string;
  validQuery: string;
}[] = [
  {
    path: "products",
    handler: getProducts,
    response: partnerProductsResponse,
    badQuery: "?status=archived",
    badParam: "status",
    validQuery: "?status=running&limit=500",
  },
  {
    path: "families",
    handler: getFamilies,
    response: partnerFamiliesResponse,
    badQuery: "?limit=501",
    badParam: "limit",
    validQuery: "?marketing_consent=granted&utm_campaign=lynx-autumn-a",
  },
  {
    path: "enrolments",
    handler: getEnrolments,
    response: partnerEnrolmentsResponse,
    badQuery: "?parent_id=not-a-uuid",
    badParam: "parent_id",
    validQuery:
      "?parent_id=9c3e2b4a-7f11-4d0e-8b6a-1a2b3c4d5e6f&status=waitlisted",
  },
  {
    path: "sessions",
    handler: getSessions,
    response: partnerSessionsResponse,
    badQuery: "?from=19-10-2026",
    badParam: "from",
    validQuery: "?from=2026-10-01&to=2026-10-31",
  },
  {
    path: "feedback",
    handler: getFeedback,
    response: partnerFeedbackResponse,
    badQuery: "?participant_id=abc",
    badParam: "participant_id",
    validQuery: "?group_id=0e2b6a7e-6d2a-4f6c-b3a1-3f1f9c8e5a21",
  },
  {
    path: "roblox-research",
    handler: getRobloxResearch,
    // Shaped like a date and not a day: the regex alone would pass it.
    badQuery: "?to=2026-02-31",
    badParam: "to",
    response: partnerRobloxResearchResponse,
    validQuery: "?product_id=5a1f8e1c-1b0e-4a3e-9a9c-2c9a4d8f0b11",
  },
  {
    path: "traffic",
    handler: getTraffic,
    response: partnerTrafficResponse,
    badQuery: "?page=blog",
    badParam: "page",
    validQuery: "?page=product&from=2026-09-01&to=2026-09-14",
  },
];

/** The six resources that return records; `/traffic` returns an aggregate. */
const LIST_ROUTES = ROUTES.filter((route) => route.path !== "traffic");

/** The resources that take a `from`/`to` window. */
const RANGE_PATHS = ["sessions", "feedback", "roblox-research", "traffic"];
const RANGE_ROUTES = ROUTES.filter((route) => RANGE_PATHS.includes(route.path));

const cases = ROUTES.map((route) => [route.path, route] as const);
const listCases = LIST_ROUTES.map((route) => [route.path, route] as const);
const rangeCases = RANGE_ROUTES.map((route) => [route.path, route] as const);

// --- Tests ---
//
// The routes are skeletons: they authenticate, validate, and answer the
// documented shape with no records. What is worth testing is exactly that —
// that an unauthenticated or malformed call is refused, and that a good call
// gets the published envelope rather than an improvised one. There is
// deliberately no database access to mock.

describe("the Lynx Educate partner API", () => {
  beforeEach(() => {
    vi.stubEnv("LYNX_PARTNER_API_KEY", API_KEY);
  });
  // The node project shares a worker between files, so the stub is handed back.
  afterEach(() => vi.unstubAllEnvs());

  // --- Auth ---

  describe("authentication", () => {
    it.each(cases)("%s answers 500 when the key is not configured", async (_path, route) => {
      vi.stubEnv("LYNX_PARTNER_API_KEY", "");
      const response = route.handler(createRequest(route.path));
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error.code).toBe("server_misconfigured");
    });

    it.each(cases)("%s answers 401 with no Authorization header", async (_path, route) => {
      const response = route.handler(createRequest(route.path, "", null));
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error.code).toBe("unauthorized");
    });

    it.each(cases)("%s answers 401 to a non-Bearer header", (_path, route) => {
      const response = route.handler(
        createRequest(route.path, "", `Basic ${API_KEY}`),
      );
      expect(response.status).toBe(401);
    });

    it.each(cases)("%s answers 401 to a wrong key of a different length", (_path, route) => {
      // Rejected by the length guard, before timingSafeEqual is reached.
      const response = route.handler(
        createRequest(route.path, "", "Bearer wrong-key"),
      );
      expect(response.status).toBe(401);
    });

    it.each(cases)("%s answers 401 to a wrong key of the SAME length", (_path, route) => {
      // The case that actually reaches timingSafeEqual — every other auth case
      // stops at the length guard, so without this the constant-time compare is
      // never executed and reordering the two could go unnoticed.
      const response = route.handler(
        createRequest(route.path, "", `Bearer ${API_KEY.slice(0, -1)}X`),
      );
      expect(response.status).toBe(401);
    });

    it.each(cases)("%s accepts a lowercase scheme", (_path, route) => {
      // RFC 7235 makes the scheme case-insensitive; refusing `bearer` would be
      // our bug presented as the partner's.
      const response = route.handler(
        createRequest(route.path, "", `bearer ${API_KEY}`),
      );
      expect(response.status).toBe(200);
    });

    it.each(cases)("%s answers 401 to a Bearer with no token", (_path, route) => {
      const response = route.handler(createRequest(route.path, "", "Bearer "));
      expect(response.status).toBe(401);
    });

    it.each(cases)("%s refuses a bad key before reading the query", (_path, route) => {
      // Auth precedes validation, so a caller without the key cannot probe the
      // input handling by reading which parameter was rejected.
      const response = route.handler(
        createRequest(route.path, route.badQuery, "Bearer wrong-key"),
      );
      expect(response.status).toBe(401);
    });
  });

  // --- Validation ---

  describe("query validation", () => {
    it.each(cases)("%s answers 400 to a malformed parameter", async (_path, route) => {
      const response = route.handler(
        createRequest(route.path, route.badQuery),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("invalid_query");
      expect(body.error.message).toContain(route.badParam);
    });

    it.each(cases)("%s accepts its documented filters", (_path, route) => {
      const response = route.handler(
        createRequest(route.path, route.validQuery),
      );
      expect(response.status).toBe(200);
    });

    it.each(listCases)("%s accepts a cursor", (_path, route) => {
      const response = route.handler(
        createRequest(
          route.path,
          "?cursor=eyJpZCI6IjVhMWY4ZTFjLTFiMGUtNGEzZS05YTljLTJjOWE0ZDhmMGIxMSJ9",
        ),
      );
      expect(response.status).toBe(200);
    });

    it.each(listCases)("%s rejects a limit above 500", (_path, route) => {
      expect(route.handler(createRequest(route.path, "?limit=501")).status).toBe(400);
    });

    it.each(listCases)("%s rejects a non-numeric limit", (_path, route) => {
      expect(route.handler(createRequest(route.path, "?limit=many")).status).toBe(400);
    });

    it.each(rangeCases)("%s rejects a reversed date range", async (_path, route) => {
      // A reversed range is empty, so accepting it would answer a typo with a
      // confident, permanently empty pull — the one failure a scheduled sync
      // would not notice.
      const response = route.handler(
        createRequest(route.path, "?from=2026-10-31&to=2026-10-01"),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.message).toContain("from");
      expect(body.error.message).toContain("to");
    });

    it.each(rangeCases)("%s accepts a single-day range", (_path, route) => {
      const response = route.handler(
        createRequest(route.path, "?from=2026-10-01&to=2026-10-01"),
      );
      expect(response.status).toBe(200);
    });

    it("rejects a product_id on /traffic asking for another kind of page", async () => {
      const response = getTraffic(
        createRequest(
          "traffic",
          "?page=landing&product_id=5a1f8e1c-1b0e-4a3e-9a9c-2c9a4d8f0b11",
        ),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.message).toContain("product_id");
      expect(body.error.message).toContain("page");
    });

    it("accepts a product_id on /traffic with the page it implies, or none", () => {
      const productId = "5a1f8e1c-1b0e-4a3e-9a9c-2c9a4d8f0b11";
      expect(
        getTraffic(createRequest("traffic", `?product_id=${productId}`)).status,
      ).toBe(200);
      expect(
        getTraffic(
          createRequest("traffic", `?page=product&product_id=${productId}`),
        ).status,
      ).toBe(200);
    });

    it("takes no paging on /traffic, and ignores what it is not given", () => {
      // The aggregate is not paginated, and zod strips what the schema does not
      // name — so a stray `limit` is ignored rather than refused.
      expect(getTraffic(createRequest("traffic", "?limit=501")).status).toBe(200);
    });
  });

  // --- The empty answer ---

  describe("the documented empty answer", () => {
    it.each(listCases)("%s returns an empty last page", async (_path, route) => {
      const response = route.handler(createRequest(route.path));
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toEqual({ data: [], next_cursor: null });
      // Asserted against the contract as well as the literal: the literal says
      // what this build returns, the schema says it is still the published
      // shape once records arrive.
      expect(() => route.response.parse(body)).not.toThrow();
    });

    it("returns the traffic aggregate with no pages", async () => {
      const response = getTraffic(
        createRequest("traffic", "?page=product&from=2026-09-01&to=2026-09-14"),
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.pages).toEqual([]);
      // The range the caller asked for, echoed back.
      expect(body.range).toEqual({ from: "2026-09-01", to: "2026-09-14" });
      expect(() => partnerTrafficResponse.parse(body)).not.toThrow();
    });

    it("defaults the traffic range to the last thirty days", async () => {
      // The clock is pinned rather than recomputed at assertion time: a test
      // that derives its expectation the same way the code does asserts only
      // that the two agree, and would pass a window of any length. It is also
      // the one case that can straddle midnight UTC.
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-15T23:59:00Z"));
      try {
        const body = await getTraffic(createRequest("traffic")).json();
        // Thirty days counted inclusively: today and the twenty-nine before it.
        expect(body.range).toEqual({ from: "2026-08-17", to: "2026-09-15" });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // --- Caching ---

  it.each(cases)("%s forbids caching its answer", (_path, route) => {
    // The body is scoped to the key that asked for it and is personal data
    // about families and children, so nothing between us and Lynx may keep a
    // copy — an erasure honoured in one pull must not be undone by a cached
    // page of the previous one.
    const response = route.handler(createRequest(route.path));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(cases)("%s forbids caching a refusal too", (_path, route) => {
    const response = route.handler(createRequest(route.path, "", null));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
