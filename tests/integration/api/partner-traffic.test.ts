import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { GET } from "@/app/api/partner/v1/traffic/route";
import {
  partnerTrafficResponse,
  type PartnerTrafficResponse,
} from "@/services/partner/partner.contracts";
import type { TrafficCacheKey } from "@/services/partner/partner-traffic.server";
import type { FetchMock } from "../../mocks/postgrest-fetch";
import { PARTNER_TEST_KEY, partnerRequest, postgrestTables } from "../../mocks/partner-api";

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

/**
 * Next's data cache, in memory: an entry per key parts and JSON-serialised
 * arguments — the key `unstable_cache` itself derives — and a record of every
 * wrapper's options, so a suite can see what is cached, under what, and for how
 * long.
 */
const cache = vi.hoisted(() => ({
  entries: new Map<string, PartnerTrafficResponse>(),
  options: [] as { keyParts: string[]; revalidate: number | undefined }[],
}));

vi.mock("next/cache", () => ({
  unstable_cache:
    (
      body: (key: TrafficCacheKey) => Promise<PartnerTrafficResponse>,
      keyParts: string[],
      options: { revalidate?: number },
    ) =>
    async (key: TrafficCacheKey): Promise<PartnerTrafficResponse> => {
      cache.options.push({ keyParts, revalidate: options.revalidate });
      const entry = JSON.stringify([keyParts, [key]]);
      const hit = cache.entries.get(entry);
      if (hit !== undefined) return hit;
      const value = await body(key);
      cache.entries.set(entry, value);
      return value;
    },
}));

// --- Fixtures ---

const PRODUCT = "10000000-0000-4000-8000-000000000001";
const PRODUCT_2 = "10000000-0000-4000-8000-000000000002";
const UNVIEWED_PRODUCT = "10000000-0000-4000-8000-000000000003";
const SHOP_ONLY_PRODUCT = "10000000-0000-4000-8000-000000000009";

const NOW = new Date("2026-09-17T10:15:00Z");

/** One bucket of views as Vercel stores them. */
interface Views {
  path: string;
  route: string;
  day: string;
  campaign?: string;
  source?: string;
  medium?: string;
  environment?: string;
  views: number;
}

const LANDING = "/roblox";
const SHOP = "/shop";
const PRODUCT_ROUTE = "/shop/[id]";

const VIEWS: Views[] = [
  // The landing page, in two languages, on two days.
  { path: "/en/roblox", route: LANDING, day: "2026-09-01", campaign: "lynx-autumn-a", source: "lynx", medium: "email", views: 40 },
  { path: "/fi/roblox", route: LANDING, day: "2026-09-02", campaign: "lynx-autumn-a", source: "lynx", medium: "email", views: 10 },
  { path: "/en/roblox", route: LANDING, day: "2026-09-02", campaign: "Lynx-Autumn-A", source: "lynx", medium: "social", views: 5 },
  { path: "/en/roblox", route: LANDING, day: "2026-09-02", views: 30 },
  // A preview deployment's view is not traffic.
  { path: "/en/roblox", route: LANDING, day: "2026-09-02", environment: "preview", views: 999 },
  // The shop.
  { path: "/sv/butik", route: SHOP, day: "2026-09-03", source: "google", views: 12 },
  // A Programme product, every locale on one page, the pre-locale path too.
  { path: `/en/shop/${PRODUCT}`, route: PRODUCT_ROUTE, day: "2026-09-01", campaign: "lynx-autumn-a", source: "lynx", medium: "email", views: 6 },
  { path: `/fi/kauppa/${PRODUCT}`, route: PRODUCT_ROUTE, day: "2026-09-02", campaign: "lynx-autumn-a", source: "lynx", medium: "email", views: 3 },
  { path: `/shop/${PRODUCT}`, route: PRODUCT_ROUTE, day: "2026-09-02", views: 1 },
  { path: `/fr/boutique/${PRODUCT_2}`, route: PRODUCT_ROUTE, day: "2026-09-05", views: 2 },
  // A product outside the Programme had views; they are not reported.
  { path: `/en/shop/${SHOP_ONLY_PRODUCT}`, route: PRODUCT_ROUTE, day: "2026-09-01", views: 50 },
  // Outside the default window.
  { path: "/en/roblox", route: LANDING, day: "2026-08-01", views: 100 },
];

const PROGRAMME_PRODUCTS = [PRODUCT, PRODUCT_2, UNVIEWED_PRODUCT];

const DAY_MS = 86_400_000;

type Clause = (views: Views) => boolean;

/**
 * The filters the reader sends, parsed: clauses joined by `and`, each an `eq` on
 * one dimension or an `in` over a list. Anything else is refused, so a filter
 * the fake does not understand fails the suite rather than matching everything.
 */
function parseFilter(filter: string): Clause[] {
  const literal = (text: string) => text.slice(1, -1).replace(/''/g, "'");
  const field = (name: string): ((views: Views) => string) => {
    if (name === "environment") return (views) => views.environment ?? "production";
    if (name === "route") return (views) => views.route;
    if (name === "requestPath") return (views) => views.path;
    throw new Error(`the fake does not filter on ${name}`);
  };
  return filter.split(" and ").map((clause): Clause => {
    const eq = /^(\w+) eq ('(?:[^']|'')*')$/.exec(clause);
    if (eq) {
      const read = field(eq[1]);
      return (views) => read(views) === literal(eq[2]);
    }
    const inList = /^(\w+) in \((.*)\)$/.exec(clause);
    if (inList) {
      const read = field(inList[1]);
      const values = inList[2].split(", ").map(literal);
      return (views) => values.includes(read(views));
    }
    throw new Error(`the fake cannot parse the filter clause ${clause}`);
  });
}

/**
 * Vercel's aggregate endpoint over `views`: filtered, bounded by the instants,
 * grouped by up to two dimensions, the top `limit` groups kept and the rest
 * folded into an `"Others"` row — the behaviour a complete read has to survive.
 */
function fakeVercel(views: readonly Views[], adjust?: (url: URL, rows: Record<string, unknown>[]) => void) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== "api.vercel.com") throw new Error(`unexpected fetch to ${url.href}`);
    if (new Headers(init?.headers).get("authorization") !== "Bearer test-vercel-token") {
      return new Response("{}", { status: 403 });
    }
    const since = Number(url.searchParams.get("since"));
    const until = Number(url.searchParams.get("until"));
    const by = url.searchParams.getAll("by");
    const limit = Number(url.searchParams.get("limit"));
    const clauses = parseFilter(url.searchParams.get("filter") ?? "");

    const groups = new Map<string, Record<string, unknown>>();
    for (const bucket of views) {
      const at = Date.parse(`${bucket.day}T00:00:00Z`);
      if (at < since || at > until || !clauses.every((clause) => clause(bucket))) continue;
      const values: Record<string, string> = {};
      for (const dimension of by) {
        if (dimension === "day") values.timestamp = `${bucket.day}T00:00:00.000Z`;
        else if (dimension === "utmCampaign") values.utmCampaign = bucket.campaign ?? "";
        else if (dimension === "utmSource") values.utmSource = bucket.source ?? "";
        else if (dimension === "utmMedium") values.utmMedium = bucket.medium ?? "";
        else if (dimension === "requestPath") values.requestPath = bucket.path;
        else throw new Error(`the fake does not group by ${dimension}`);
      }
      const key = JSON.stringify(values);
      const group = groups.get(key) ?? { ...values, pageviews: 0, visitors: 0 };
      group.pageviews = Number(group.pageviews) + bucket.views;
      groups.set(key, group);
    }

    let rows = [...groups.values()].sort((a, b) => Number(b.pageviews) - Number(a.pageviews));
    if (rows.length > limit) {
      const others: Record<string, unknown> = { pageviews: 0, visitors: 0 };
      for (const dimension of by) if (dimension !== "day") others[dimension] = "Others";
      for (const row of rows.slice(limit)) others.pageviews = Number(others.pageviews) + Number(row.pageviews);
      rows = [...rows.slice(0, limit), others];
    }
    adjust?.(url, rows);
    return new Response(JSON.stringify({ data: rows, query: {}, version: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

function vercelCalls(fetchMock: ReturnType<typeof fakeVercel>): URL[] {
  return fetchMock.mock.calls.map(
    ([input]) => new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url),
  );
}

function tables() {
  return postgrestTables({
    product_required_consents: (url) =>
      url.searchParams.get("document_slug") === "eq.roblox-programme-terms"
        ? PROGRAMME_PRODUCTS.map((product_id) => ({ product_id }))
        : [],
  });
}

function request(query = ""): Request {
  return partnerRequest("v1/traffic", { query });
}

/** Every split of every page sums to the page's pageviews — the documented property. */
function expectSplitsSumToPageviews(body: PartnerTrafficResponse) {
  const sum = (entries: { pageviews: number }[]) =>
    entries.reduce((total, entry) => total + entry.pageviews, 0);
  for (const page of body.pages) {
    expect(sum(page.by_campaign)).toBe(page.pageviews);
    expect(sum(page.by_source_medium)).toBe(page.pageviews);
    expect(sum(page.by_day)).toBe(page.pageviews);
  }
}

async function read(query = "") {
  const response = await GET(request(query));
  expect(response.status).toBe(200);
  const body = partnerTrafficResponse.parse(await response.json());
  expectSplitsSumToPageviews(body);
  return body;
}

// --- Tests ---

describe("GET /api/partner/v1/traffic", () => {
  let vercel: ReturnType<typeof fakeVercel>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.stubEnv("LYNX_PARTNER_API_KEY", PARTNER_TEST_KEY);
    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "test-vercel-token");
    vi.stubEnv("VERCEL_ANALYTICS_TEAM_ID", "team_test");
    vi.stubEnv("VERCEL_ANALYTICS_PROJECT_ID", "prj_test");
    db.fetch = tables();
    vercel = fakeVercel(VIEWS);
    vi.stubGlobal("fetch", vercel);
    cache.entries.clear();
    cache.options.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    db.fetch = undefined;
  });

  describe("configuration", () => {
    it.each(["VERCEL_ANALYTICS_TOKEN", "VERCEL_ANALYTICS_TEAM_ID", "VERCEL_ANALYTICS_PROJECT_ID"])(
      "answers 500 server_misconfigured without %s, and reads nothing",
      async (name) => {
        vi.stubEnv(name, "");
        const response = await GET(request());
        expect(response.status).toBe(500);
        const body = await response.json();
        expect(body.error.code).toBe("server_misconfigured");
        expect(body.error.message).not.toContain(name);
        expect(vercel).not.toHaveBeenCalled();
        expect(db.fetch).not.toHaveBeenCalled();
        expect(response.headers.get("cache-control")).toBe("private, no-store");
      },
    );

    it("still refuses a caller without the key before admitting anything is unconfigured", async () => {
      vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "");
      const response = await GET(partnerRequest("v1/traffic", { authorization: null }));
      expect(response.status).toBe(401);
    });
  });

  it("answers the landing page, the shop and each viewed Programme product over the last 30 days", async () => {
    const body = await read();

    expect(body.range).toEqual({ from: "2026-08-19", to: "2026-09-17" });
    expect(body.pages.map((page) => [page.page, page.product_id, page.pageviews])).toEqual([
      ["landing", null, 85],
      ["shop", null, 12],
      ["product", PRODUCT, 10],
      ["product", PRODUCT_2, 2],
    ]);

    expect(body.pages[0]).toEqual({
      page: "landing",
      product_id: null,
      pageviews: 85,
      by_campaign: [
        { utm_campaign: "lynx-autumn-a", pageviews: 50 },
        // Values differing only in case are separate campaigns.
        { utm_campaign: "Lynx-Autumn-A", pageviews: 5 },
        { utm_campaign: null, pageviews: 30 },
      ],
      by_source_medium: [
        { utm_source: "lynx", utm_medium: "email", pageviews: 50 },
        { utm_source: "lynx", utm_medium: "social", pageviews: 5 },
        { utm_source: null, utm_medium: null, pageviews: 30 },
      ],
      by_day: [
        { date: "2026-09-01", pageviews: 40 },
        { date: "2026-09-02", pageviews: 45 },
      ],
    });
    expect(body.pages[1].by_source_medium).toEqual([
      { utm_source: "google", utm_medium: null, pageviews: 12 },
    ]);
    // Every language of a product page, and its pre-locale path, count as one page.
    expect(body.pages[2].by_day).toEqual([
      { date: "2026-09-01", pageviews: 6 },
      { date: "2026-09-02", pageviews: 4 },
    ]);
  });

  it("reads Vercel with production-only filters naming each page", async () => {
    await read();
    const filters = vercelCalls(vercel).map((url) => url.searchParams.get("filter") ?? "");
    expect(filters.every((filter) => filter.startsWith("environment eq 'production' and "))).toBe(true);
    expect(filters).toContain("environment eq 'production' and route eq '/roblox'");
    expect(filters).toContain("environment eq 'production' and route eq '/shop'");
    expect(filters).toContain(
      `environment eq 'production' and requestPath in (${[
        `/en/shop/${PRODUCT}`,
        `/fi/kauppa/${PRODUCT}`,
        `/sv/butik/${PRODUCT}`,
        `/fr/boutique/${PRODUCT}`,
        `/tlh/shop/${PRODUCT}`,
        `/shop/${PRODUCT}`,
      ]
        .map((path) => `'${path}'`)
        .join(", ")})`,
    );
    // The unviewed product gets no split reads of its own.
    const splitFilters = vercelCalls(vercel)
      .filter((url) => !url.searchParams.getAll("by").includes("requestPath"))
      .map((url) => url.searchParams.get("filter") ?? "");
    expect(splitFilters.some((filter) => filter.includes(UNVIEWED_PRODUCT))).toBe(false);
  });

  it("answers only the page kind asked for", async () => {
    expect((await read("?page=landing")).pages.map((page) => page.page)).toEqual(["landing"]);
    expect((await read("?page=shop")).pages.map((page) => page.page)).toEqual(["shop"]);
    expect((await read("?page=product")).pages.map((page) => page.product_id)).toEqual([
      PRODUCT,
      PRODUCT_2,
    ]);
  });

  it("answers one product's page for product_id, and nothing for an unviewed, unknown or non-Programme one", async () => {
    expect((await read(`?product_id=${PRODUCT_2}`)).pages).toEqual([
      {
        page: "product",
        product_id: PRODUCT_2,
        pageviews: 2,
        by_campaign: [{ utm_campaign: null, pageviews: 2 }],
        by_source_medium: [{ utm_source: null, utm_medium: null, pageviews: 2 }],
        by_day: [{ date: "2026-09-05", pageviews: 2 }],
      },
    ]);
    expect((await read(`?product_id=${UNVIEWED_PRODUCT}`)).pages).toEqual([]);
    expect((await read(`?product_id=${SHOP_ONLY_PRODUCT}`)).pages).toEqual([]);
    expect((await read("?product_id=10000000-0000-4000-8000-0000000000ff")).pages).toEqual([]);
  });

  it("counts only the days in range, inclusive at both ends", async () => {
    const body = await read("?page=landing&from=2026-09-02&to=2026-09-02");
    expect(body.range).toEqual({ from: "2026-09-02", to: "2026-09-02" });
    expect(body.pages[0].pageviews).toBe(45);
  });

  it("answers the landing page and the shop with zeros when nothing was viewed", async () => {
    const body = await read("?from=2026-06-01&to=2026-06-30");
    expect(body.pages).toEqual([
      { page: "landing", product_id: null, pageviews: 0, by_campaign: [], by_source_medium: [], by_day: [] },
      { page: "shop", product_id: null, pageviews: 0, by_campaign: [], by_source_medium: [], by_day: [] },
    ]);
  });

  it("chunks a long range's day reads so no response can hold more than 100 days", async () => {
    await read("?page=landing&from=2026-05-31&to=2026-09-17");
    const dayWindows = vercelCalls(vercel)
      .filter((url) => url.searchParams.getAll("by").includes("day"))
      .map((url) => (Number(url.searchParams.get("until")) + 1 - Number(url.searchParams.get("since"))) / DAY_MS);
    expect(dayWindows.length).toBeGreaterThan(1);
    expect(Math.max(...dayWindows)).toBeLessThanOrEqual(100);
    expect(dayWindows.reduce((a, b) => a + b, 0)).toBe(110);
  });

  it("answers a range reaching past the counts for the days they cover, and reads only those", async () => {
    const body = await read("?page=landing&from=2000-01-01&to=9999-12-31");
    expect(body.range).toEqual({ from: "2026-05-31", to: "2026-09-17" });
    expect(body.pages[0].pageviews).toBe(185);

    const calls = vercelCalls(vercel);
    const since = Math.min(...calls.map((url) => Number(url.searchParams.get("since"))));
    const until = Math.max(...calls.map((url) => Number(url.searchParams.get("until"))));
    expect(since).toBe(Date.parse("2026-05-31T00:00:00Z"));
    expect(until).toBe(Date.parse("2026-09-18T00:00:00Z") - 1);
    // Three splits, the day split in two windows: not a read per hundred days since 2000.
    expect(calls).toHaveLength(4);
  });

  it.each([
    ["a from after the to a default completed", "?from=2027-01-01", "from"],
    ["a range wholly before the counts begin", "?from=2020-01-01&to=2020-12-31", "to"],
    ["a range wholly after today", "?from=2027-01-01&to=2027-02-01", "from"],
  ])("answers 400 invalid_query for %s, naming the parameter, and reads nothing", async (_, query, parameter) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_query");
    expect(body.error.message.startsWith(`${parameter}:`)).toBe(true);
    expect(vercel).not.toHaveBeenCalled();
    expect(db.fetch).not.toHaveBeenCalled();
  });

  it("counts a campaign genuinely named Others like any other", async () => {
    vi.stubGlobal(
      "fetch",
      fakeVercel([
        ...VIEWS,
        { path: "/en/roblox", route: LANDING, day: "2026-09-03", campaign: "Others", views: 4 },
      ]),
    );
    const body = await read("?page=landing&from=2026-09-01&to=2026-09-10");
    expect(body.pages[0].by_campaign).toContainEqual({ utm_campaign: "Others", pageviews: 4 });
    expect(body.pages[0].pageviews).toBe(89);
  });

  it("counts every campaign when a range has more than Vercel folds into Others", async () => {
    const many: Views[] = Array.from({ length: 150 }, (_, i) => ({
      path: "/en/roblox",
      route: LANDING,
      day: `2026-09-${String((i % 10) + 1).padStart(2, "0")}`,
      campaign: `lynx-${String(i).padStart(3, "0")}`,
      views: 1 + (i % 3),
    }));
    const folding = fakeVercel(many);
    vi.stubGlobal("fetch", folding);

    const body = await read("?page=landing&from=2026-09-01&to=2026-09-10");
    // The campaign read folded and was split; the day read never could.
    expect(
      vercelCalls(folding).filter((url) => url.searchParams.getAll("by").includes("utmCampaign")).length,
    ).toBeGreaterThan(1);
    expect(body.pages[0].by_campaign).toHaveLength(150);
    expect(body.pages[0].by_campaign.some((entry) => entry.utm_campaign === "Others")).toBe(false);
    expect(body.pages[0].pageviews).toBe(many.reduce((total, views) => total + views.views, 0));
  });

  it("answers 500 when a single day still folds into Others", async () => {
    const many: Views[] = Array.from({ length: 150 }, (_, i) => ({
      path: "/en/roblox",
      route: LANDING,
      day: "2026-09-01",
      campaign: `lynx-${i}`,
      views: 1,
    }));
    vi.stubGlobal("fetch", fakeVercel(many));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(request("?page=landing&from=2026-09-01&to=2026-09-01"));
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("internal_error");
    expect(String(logged.mock.calls[0]?.[1])).toContain("Others");
  });

  it("answers 500 internal_error when Vercel refuses the token", async () => {
    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "revoked-token");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request());
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("vercel");
  });

  it("reads a page again when a view lands between its split reads", async () => {
    let raced = false;
    const racing = fakeVercel(VIEWS, (url, rows) => {
        const isLandingDays =
          url.searchParams.getAll("by").includes("day") &&
          (url.searchParams.get("filter") ?? "").includes("/roblox");
        if (isLandingDays && !raced) {
          raced = true;
          rows[0].pageviews = Number(rows[0].pageviews) + 1;
        }
    });
    vi.stubGlobal("fetch", racing);

    const body = await read("?page=landing");
    expect(raced).toBe(true);
    expect(body.pages[0].pageviews).toBe(85);
    // Each of the three splits was read twice.
    expect(vercelCalls(racing)).toHaveLength(6);
  });

  it("answers 500 when the splits keep disagreeing", async () => {
    vi.stubGlobal(
      "fetch",
      fakeVercel(VIEWS, (url, rows) => {
        if (url.searchParams.getAll("by").includes("day") && rows.length > 0) {
          rows[0].pageviews = Number(rows[0].pageviews) + 1;
        }
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request("?page=landing"));
    expect(response.status).toBe(500);
  });

  describe("the hour-long cache", () => {
    it("caches the resolved answer for an hour, keyed by the normalized query", async () => {
      const first = await read();
      const calls = vercel.mock.calls.length;
      expect(calls).toBeGreaterThan(0);
      expect(cache.options.every((entry) => entry.revalidate === 3600)).toBe(true);

      // The same query, and the same window named explicitly, are one entry.
      expect(await read()).toEqual(first);
      expect(await read("?from=2026-08-19&to=2026-09-17")).toEqual(first);
      expect(vercel.mock.calls.length).toBe(calls);
      expect(db.fetch).toHaveBeenCalledTimes(1);
    });

    it("treats product_id as page=product in the key", async () => {
      await read(`?product_id=${PRODUCT}`);
      const calls = vercel.mock.calls.length;
      await read(`?page=product&product_id=${PRODUCT}`);
      expect(vercel.mock.calls.length).toBe(calls);
    });

    it("reads again for another query or in the next UTC hour", async () => {
      await read("?page=landing");
      const calls = vercel.mock.calls.length;

      await read("?page=shop");
      expect(vercel.mock.calls.length).toBeGreaterThan(calls);

      const afterShop = vercel.mock.calls.length;
      vi.setSystemTime(new Date("2026-09-17T10:59:59Z"));
      await read("?page=landing");
      expect(vercel.mock.calls.length).toBe(afterShop);

      vi.setSystemTime(new Date("2026-09-17T11:00:00Z"));
      await read("?page=landing");
      expect(vercel.mock.calls.length).toBeGreaterThan(afterShop);
    });

    it("does not cache a failed answer", async () => {
      vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "revoked-token");
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect((await GET(request())).status).toBe(500);

      vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "test-vercel-token");
      expect((await GET(request())).status).toBe(200);
    });
  });

  it("forbids caching the answer downstream", async () => {
    const response = await GET(request());
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
