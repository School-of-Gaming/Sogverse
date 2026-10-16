import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The admin analytics page's reads, over a mocked Vercel, Next's data cache in
 * memory and a stubbed database. What matters here: each read answers on its
 * own, a failure is a reason and never zeros, nothing failed is cached, and a
 * cached read is reused for the rest of its UTC hour and never past it.
 */

const cache = vi.hoisted(() => ({
  entries: new Map<string, unknown>(),
  options: [] as { keyParts: string[]; revalidate: number | undefined }[],
}));

vi.mock("next/cache", () => ({
  unstable_cache:
    (body: (key: unknown) => Promise<unknown>, keyParts: string[], options: { revalidate?: number }) =>
    async (key: unknown) => {
      cache.options.push({ keyParts, revalidate: options.revalidate });
      const entry = JSON.stringify([keyParts, [key]]);
      if (cache.entries.has(entry)) return cache.entries.get(entry);
      const value = await body(key);
      cache.entries.set(entry, value);
      return value;
    },
}));

const db = vi.hoisted(() => ({
  profiles: [] as { created_at: string; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null }[],
  calls: [] as [string, ...unknown[]][],
  fail: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      db.calls.push(["from", table]);
      const chain = {
        select: (...args: unknown[]) => (db.calls.push(["select", ...args]), chain),
        eq: (...args: unknown[]) => (db.calls.push(["eq", ...args]), chain),
        gte: (...args: unknown[]) => (db.calls.push(["gte", ...args]), chain),
        lt: (...args: unknown[]) => (db.calls.push(["lt", ...args]), chain),
        order: (...args: unknown[]) => (db.calls.push(["order", ...args]), chain),
        range: async () =>
          db.fail
            ? { data: null, error: new Error("permission denied"), count: null }
            : { data: db.profiles, error: null, count: db.profiles.length },
      };
      return chain;
    },
  }),
}));

const landing = vi.hoisted(() => ({
  drafts: [] as { id: string; versions: { locale: string; title: string; slug: string }[] }[],
  published: [] as { id: string; versions: { locale: string; slug: string }[] }[],
}));

vi.mock("@/services/landing-pages/landing-pages.service", () => ({
  LandingPageService: class {
    async listAdminPages() {
      return landing.drafts;
    }
    async listPublishedPages() {
      return landing.published;
    }
  },
}));

import { createFetchStubbedClient, postgrestPage } from "../../../mocks/postgrest-fetch";
import { trafficPath } from "@/services/admin-analytics/admin-analytics.build";
import {
  readCampaigns,
  readLandingPages,
  readPathViews,
  readServedPageLoads,
  readSignups,
  readTopPages,
  readWebAnalyticsOverview,
  trafficFilterExpression,
  type TrafficFilter,
} from "@/services/admin-analytics/admin-analytics.server";

const NOW = new Date("2026-10-15T09:30:00Z");
const RANGE = { from: "2026-10-13", to: "2026-10-15" };
const PAGE = "20000000-0000-4000-8000-000000000001";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function urlOf(input: RequestInfo | URL): URL {
  return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
}

/** Answers the Web Analytics endpoint by the grouping asked for, and the request log by day. */
type Answer = (url: URL, body: unknown) => Response | Promise<Response>;

/** The UTC day a request-log query starts on. */
function startDayOf(body: unknown): string {
  return typeof body === "object" && body !== null && "startTime" in body && typeof body.startTime === "string"
    ? body.startTime.slice(0, 10)
    : "";
}

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function answer(handler: Answer) {
  fetchMock.mockImplementation(async (input, init) =>
    handler(urlOf(input), init?.body ? JSON.parse(String(init.body)) : null),
  );
}

function webAnalyticsCalls(): URL[] {
  return fetchMock.mock.calls.map(([input]) => urlOf(input)).filter((url) => url.pathname.includes("web-analytics"));
}

beforeEach(() => {
  cache.entries.clear();
  cache.options.length = 0;
  db.profiles = [];
  db.calls = [];
  db.fail = false;
  landing.drafts = [];
  landing.published = [];
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "vercel-token");
  vi.stubEnv("VERCEL_ANALYTICS_TEAM_ID", "team_test");
  vi.stubEnv("VERCEL_ANALYTICS_PROJECT_ID", "prj_test");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("configuration", () => {
  it("answers unconfigured for every Vercel read, without calling anything", async () => {
    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "");
    expect(await readWebAnalyticsOverview(RANGE, NOW)).toEqual({ ok: false, reason: "unconfigured" });
    expect(await readServedPageLoads(RANGE, NOW)).toEqual({ ok: false, reason: "unconfigured" });
    expect(await readTopPages(RANGE, NOW)).toEqual({ ok: false, reason: "unconfigured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("readWebAnalyticsOverview", () => {
  const overview: Answer = (url) => {
    const by = url.searchParams.getAll("by");
    expect(url.searchParams.get("filter")).toBe("environment eq 'production'");
    if (by[0] === "day") {
      return json({
        data: [
          { timestamp: "2026-10-13T00:00:00.000Z", pageviews: 10, visitors: 4 },
          { timestamp: "2026-10-15T00:00:00.000Z", pageviews: 5, visitors: 3 },
        ],
      });
    }
    return json({ data: [{ environment: "production", pageviews: 15, visitors: 6 }] });
  };

  it("reads every day and the range's own distinct visitors", async () => {
    answer(overview);
    const result = await readWebAnalyticsOverview(RANGE, NOW);
    expect(result).toEqual({
      ok: true,
      readAt: expect.any(String),
      data: {
        days: [
          { day: "2026-10-13", pageviews: 10, visitors: 4 },
          { day: "2026-10-14", pageviews: 0, visitors: 0 },
          { day: "2026-10-15", pageviews: 5, visitors: 3 },
        ],
        pageviews: 15,
        // Not 4 + 3: one visitor on two days is one visitor.
        visitors: 6,
      },
    });
    expect(cache.options[0]).toEqual({ keyParts: ["admin-analytics", "overview"], revalidate: 3600 });
  });

  it("reuses the read for the rest of the hour, and reads again in the next", async () => {
    answer(overview);
    await readWebAnalyticsOverview(RANGE, NOW);
    await readWebAnalyticsOverview(RANGE, new Date("2026-10-15T09:59:00Z"));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await readWebAnalyticsOverview(RANGE, new Date("2026-10-15T10:00:00Z"));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("answers refused when Vercel refuses the token, failed on anything else, and caches neither", async () => {
    answer(() => json({ error: { code: "forbidden" } }, 403));
    expect(await readWebAnalyticsOverview(RANGE, NOW)).toEqual({ ok: false, reason: "refused" });
    answer(() => json({ error: { code: "internal" } }, 500));
    expect(await readWebAnalyticsOverview(RANGE, NOW)).toEqual({ ok: false, reason: "failed" });
    expect(cache.entries.size).toBe(0);

    answer(overview);
    expect((await readWebAnalyticsOverview(RANGE, NOW)).ok).toBe(true);
  });
});

describe("readTopPages", () => {
  it("reads the routes once overall and once per locale, and splits each by language", async () => {
    answer((url) => {
      const filter = url.searchParams.get("filter") ?? "";
      if (filter.includes("'/fi'")) return json({ data: [{ route: "/shop", pageviews: 6, visitors: 1 }] });
      if (filter.includes("requestPath")) return json({ data: [] });
      return json({ data: [{ route: "/shop", pageviews: 8, visitors: 2 }] });
    });
    const result = await readTopPages(RANGE, NOW);
    expect(result.ok && result.data).toEqual([
      {
        route: "/shop",
        pageviews: 8,
        languages: [
          { language: "fi", pageviews: 6 },
          { language: "none", pageviews: 2 },
        ],
      },
    ]);
    expect(webAnalyticsCalls()).toHaveLength(6);
  });

  it("answers failed when a single day still folds into Others", async () => {
    const folded = {
      data: [
        ...Array.from({ length: 99 }, (_, i) => ({ route: `/r${i}`, pageviews: 1, visitors: 1 })),
        { route: "Others", pageviews: 40, visitors: 9 },
      ],
    };
    answer(() => json(folded));
    expect(await readTopPages({ from: "2026-10-15", to: "2026-10-15" }, NOW)).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});

describe("readServedPageLoads", () => {
  it("reads one day per call for the days the log holds, and names that window", async () => {
    answer((url, body) => {
      expect(url.pathname).toBe("/v2/observability/query");
      const day = startDayOf(body);
      return json({ summary: [{ vercel_request_count_sum: Number(day.slice(8)) }] });
    });
    const result = await readServedPageLoads({ from: "2026-08-01", to: "2026-10-15" }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.window).toEqual({ from: "2026-09-16", to: "2026-10-15" });
    expect(result.data.days).toHaveLength(30);
    expect(fetchMock).toHaveBeenCalledTimes(30);
    // Days 16..30 of September and 1..15 of October.
    expect(result.data.total).toBe(345 + 120);
  });

  it("reuses a day another range already read this hour", async () => {
    answer(() => json({ summary: [{ vercel_request_count_sum: 1 }] }));
    await readServedPageLoads({ from: "2026-10-14", to: "2026-10-15" }, NOW);
    await readServedPageLoads({ from: "2026-10-13", to: "2026-10-15" }, NOW);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("asks nothing for a range wholly before the log", async () => {
    const result = await readServedPageLoads({ from: "2026-07-01", to: "2026-07-31" }, NOW);
    expect(result).toEqual({
      ok: true,
      readAt: NOW.toISOString(),
      data: { window: null, days: [], total: 0 },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails the whole measure when one day fails, rather than leaving a quiet day", async () => {
    answer((_, body) =>
      startDayOf(body) === "2026-10-14"
        ? json({ error: { code: "internal" } }, 500)
        : json({ summary: [{ vercel_request_count_sum: 1 }] }),
    );
    expect(await readServedPageLoads(RANGE, NOW)).toEqual({ ok: false, reason: "failed" });
  });

  it("answers refused when the request log will not serve the token", async () => {
    answer(() => json({ error: { code: "not_found", message: "Observability Data not found." } }, 404));
    expect(await readServedPageLoads(RANGE, NOW)).toEqual({ ok: false, reason: "refused" });
  });
});

describe("readSignups", () => {
  it("counts parent accounts created in the range's UTC days, under the caller's session", async () => {
    db.profiles = [
      { created_at: "2026-10-13T08:00:00+00:00", utm_source: "meta", utm_medium: "paid_social", utm_campaign: "lynx-a" },
      { created_at: "2026-10-15T08:00:00+00:00", utm_source: null, utm_medium: null, utm_campaign: null },
    ];
    const result = await readSignups(RANGE.from, RANGE.to);
    expect(result.ok && result.data.total).toBe(2);
    expect(db.calls).toEqual(
      expect.arrayContaining([
        ["from", "profiles"],
        ["eq", "role", "customer"],
        ["gte", "created_at", "2026-10-13T00:00:00.000Z"],
        ["lt", "created_at", "2026-10-16T00:00:00.000Z"],
      ]),
    );
  });

  it("answers failed when the database refuses", async () => {
    db.fail = true;
    expect(await readSignups(RANGE.from, RANGE.to)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("readCampaigns", () => {
  it("joins Vercel's no-campaign to the database's NULL", async () => {
    answer((url) => {
      const by = url.searchParams.getAll("by");
      return json({
        data: [
          { utmCampaign: "", [by[1] ?? ""]: "", pageviews: 50, visitors: 9 },
          { utmCampaign: "lynx-a", [by[1] ?? ""]: by[1] === "utmSource" ? "meta" : "paid_social", pageviews: 7, visitors: 2 },
        ],
      });
    });
    db.profiles = [
      { created_at: "2026-10-13T08:00:00Z", utm_source: "meta", utm_medium: "paid_social", utm_campaign: "lynx-a" },
      { created_at: "2026-10-14T08:00:00Z", utm_source: null, utm_medium: null, utm_campaign: null },
    ];
    const result = await readCampaigns(RANGE, NOW);
    expect(result.ok && result.data.map((row) => [row.campaign, row.pageviews, row.signups])).toEqual([
      ["lynx-a", 7, 1],
      [null, 50, 1],
    ]);
  });

  it("fails as a whole when either side fails", async () => {
    answer(() => json({ data: [] }));
    db.fail = true;
    expect(await readCampaigns(RANGE, NOW)).toEqual({ ok: false, reason: "failed" });
  });
});

describe("readLandingPages", () => {
  it("files each landing path under the page by its slugs, live ones included", async () => {
    answer((url) => {
      expect(url.searchParams.get("filter")).toBe(
        "environment eq 'production' and route eq '/discover/[idOrSlug]'",
      );
      return json({
        data: [
          { requestPath: "/fi/tutustu/espoon-kerhot", pageviews: 4, visitors: 1 },
          { requestPath: "/fi/tutustu/live-only", pageviews: 2, visitors: 1 },
        ],
      });
    });
    landing.drafts = [
      { id: PAGE, versions: [{ locale: "fi", title: "Kerhot Espoossa", slug: "espoon-kerhot" }] },
    ];
    landing.published = [{ id: PAGE, versions: [{ locale: "fi", slug: "live-only" }] }];
    const result = await readLandingPages(RANGE, NOW);
    expect(result.ok && result.data).toEqual([
      {
        page: { id: PAGE, versions: [{ locale: "fi", title: "Kerhot Espoossa" }] },
        path: null,
        pageviews: 6,
        languages: [{ language: "fi", pageviews: 6 }],
      },
    ]);
  });
});

describe("a filtered read, as the MCP analytics tools ask", () => {
  const paths = ["/shop", "/fi/tutustu/pelaaja"].map((given) => {
    const path = trafficPath(given);
    if (path === null) throw new Error("unreachable");
    return path;
  });
  const filter: TrafficFilter = { paths, campaign: "lynx's-a" };

  it("narrows production to any of the paths' addresses and every label, quoted", () => {
    expect(trafficFilterExpression(filter)).toBe(
      "environment eq 'production' and (requestPath eq '/shop' or requestPath eq '/en/shop' or requestPath eq '/fi/kauppa' or requestPath eq '/sv/butik' or requestPath eq '/fr/boutique' or requestPath eq '/tlh/shop' or requestPath eq '/fi/tutustu/pelaaja') and utmCampaign eq 'lynx''s-a'",
    );
    expect(trafficFilterExpression({ paths: [] })).toBe("environment eq 'production'");
  });

  it("sends the filter to Vercel and caches it apart from the whole site's read", async () => {
    answer((url) => {
      const by = url.searchParams.getAll("by");
      return json({
        data:
          by[0] === "day"
            ? [{ timestamp: "2026-10-14T00:00:00.000Z", pageviews: 2, visitors: 1 }]
            : [{ environment: "production", pageviews: 2, visitors: 1 }],
      });
    });

    const narrowed = await readWebAnalyticsOverview(RANGE, NOW, filter);
    expect(narrowed.ok && narrowed.data.pageviews).toBe(2);
    expect(webAnalyticsCalls().map((url) => url.searchParams.get("filter"))).toEqual([
      trafficFilterExpression(filter),
      trafficFilterExpression(filter),
    ]);

    await readWebAnalyticsOverview(RANGE, NOW);
    expect(webAnalyticsCalls()).toHaveLength(4);
    expect(cache.options.map((option) => option.keyParts[1])).toEqual([
      `overview ${trafficFilterExpression(filter)}`,
      "overview",
    ]);
  });

  it("reads each path's views address by address", async () => {
    answer(() =>
      json({
        data: [
          { requestPath: "/fi/kauppa", pageviews: 4 },
          { requestPath: "/fi/tutustu/pelaaja", pageviews: 6 },
        ],
      }),
    );
    const result = await readPathViews(RANGE, NOW, filter);
    expect(result.ok && result.data).toEqual([
      { given: "/shop", pageviews: 4, addresses: [{ path: "/fi/kauppa", language: "fi", pageviews: 4 }] },
      {
        given: "/fi/tutustu/pelaaja",
        pageviews: 6,
        addresses: [{ path: "/fi/tutustu/pelaaja", language: "fi", pageviews: 6 }],
      },
    ]);
    expect(webAnalyticsCalls()[0]?.searchParams.getAll("by")).toEqual(["requestPath"]);
  });

  it("reads signups on the client handed in, never the page's session", async () => {
    const handedFetch = vi.fn<typeof fetch>(async () =>
      postgrestPage(
        [{ created_at: "2026-10-14T08:00:00+00:00", utm_source: null, utm_medium: null, utm_campaign: null }],
        { from: 0, total: 1 },
      ),
    );
    // The page-session stub would answer two signups; the handed client one.
    db.profiles = [
      { created_at: "2026-10-13T08:00:00+00:00", utm_source: null, utm_medium: null, utm_campaign: null },
      { created_at: "2026-10-14T08:00:00+00:00", utm_source: null, utm_medium: null, utm_campaign: null },
    ];
    const result = await readSignups(RANGE.from, RANGE.to, createFetchStubbedClient(handedFetch));
    expect(result.ok && result.data.total).toBe(1);
    expect(handedFetch).toHaveBeenCalled();
    expect(db.calls).toEqual([]);
  });
});
