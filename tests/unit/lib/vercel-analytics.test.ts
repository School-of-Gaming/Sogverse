import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  VercelAnalyticsClient,
  VercelAnalyticsError,
  earliestTrafficDay,
  readServedPageLoadsUndocumented,
  SERVED_PAGE_FILTER,
  odataString,
  splitDays,
  vercelAnalyticsConfig,
} from "@/lib/vercel-analytics.server";

/**
 * The Vercel Web Analytics reader. Its one promise is a complete count — never
 * a top-100 with the rest folded into "Others" — so most of this file is about
 * how a read is split so that no response it trusts has folded anything.
 */

const CONFIG = { token: "vercel-token", teamId: "team_test", projectId: "prj_test" };
const DAY_MS = 86_400_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function urlOf(input: RequestInfo | URL): URL {
  return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
}

function dayOfMs(ms: string | null): string {
  return new Date(Number(ms)).toISOString().slice(0, 10);
}

/**
 * A full response that folded: `rows` first, padded with filler campaigns to
 * the 100-group cap, the last of them the `"Others"` row.
 */
function foldedResponse(rows: { utmCampaign: string; pageviews: number }[], others: number) {
  const filler = Array.from({ length: 99 - rows.length }, (_, i) => ({
    utmCampaign: `filler-${i}`,
    pageviews: 0,
  }));
  return { data: [...rows, ...filler, { utmCampaign: "Others", pageviews: others }] };
}

describe("vercelAnalyticsConfig", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("names every unset variable, and only those", () => {
    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", "");
    vi.stubEnv("VERCEL_ANALYTICS_TEAM_ID", "team_test");
    vi.stubEnv("VERCEL_ANALYTICS_PROJECT_ID", "");
    expect(vercelAnalyticsConfig()).toEqual({
      ok: false,
      missing: ["VERCEL_ANALYTICS_TOKEN", "VERCEL_ANALYTICS_PROJECT_ID"],
    });
  });

  it("returns the configuration when all three are set", () => {
    vi.stubEnv("VERCEL_ANALYTICS_TOKEN", CONFIG.token);
    vi.stubEnv("VERCEL_ANALYTICS_TEAM_ID", CONFIG.teamId);
    vi.stubEnv("VERCEL_ANALYTICS_PROJECT_ID", CONFIG.projectId);
    expect(vercelAnalyticsConfig()).toEqual({ ok: true, config: CONFIG });
  });
});

describe("odataString", () => {
  it("quotes a literal and doubles an embedded quote", () => {
    expect(odataString("/shop")).toBe("'/shop'");
    expect(odataString("it's")).toBe("'it''s'");
  });
});

describe("splitDays", () => {
  it("covers the range exactly in windows of at most the size", () => {
    expect(splitDays("2026-01-01", "2026-01-01", 100)).toEqual([
      { from: "2026-01-01", to: "2026-01-01" },
    ]);
    expect(splitDays("2026-01-01", "2026-04-10", 100)).toEqual([
      { from: "2026-01-01", to: "2026-04-10" },
    ]);
    expect(splitDays("2026-01-01", "2026-04-11", 100)).toEqual([
      { from: "2026-01-01", to: "2026-04-10" },
      { from: "2026-04-11", to: "2026-04-11" },
    ]);
  });
});

describe("VercelAnalyticsClient", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the documented endpoint with the team, project, instants and the full limit", async () => {
    fetchMock.mockResolvedValue(
      json({ data: [{ utmSource: "lynx", utmMedium: "", pageviews: 7, visitors: 5 }] }),
    );
    const client = new VercelAnalyticsClient(CONFIG);

    const groups = await client.aggregatePageviews({
      by: ["utmSource", "utmMedium"],
      filter: "route eq '/roblox'",
      from: "2026-09-01",
      to: "2026-09-14",
    });

    expect(groups).toEqual([{ values: { utmSource: "lynx", utmMedium: "" }, pageviews: 7 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0];
    const url = urlOf(input);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://api.vercel.com/v1/query/web-analytics/visits/aggregate",
    );
    expect(url.searchParams.get("teamId")).toBe("team_test");
    expect(url.searchParams.get("projectId")).toBe("prj_test");
    expect(url.searchParams.getAll("by")).toEqual(["utmSource", "utmMedium"]);
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("filter")).toBe("route eq '/roblox'");
    // Inclusive at both ends, to the millisecond.
    expect(url.searchParams.get("since")).toBe(String(Date.parse("2026-09-01T00:00:00Z")));
    expect(url.searchParams.get("until")).toBe(
      String(Date.parse("2026-09-15T00:00:00Z") - 1),
    );
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer vercel-token");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("reads a day bucket as its UTC day and a null dimension as the empty string", async () => {
    fetchMock.mockResolvedValue(
      json({
        data: [
          { timestamp: "2026-09-01T00:00:00.000Z", pageviews: 3 },
          { timestamp: "2026-09-02T00:00:00.000Z", pageviews: 4 },
        ],
      }),
    );
    const client = new VercelAnalyticsClient(CONFIG);
    expect(
      await client.aggregatePageviews({
        by: ["day"],
        filter: "",
        from: "2026-09-01",
        to: "2026-09-02",
      }),
    ).toEqual([
      { values: { day: "2026-09-01" }, pageviews: 3 },
      { values: { day: "2026-09-02" }, pageviews: 4 },
    ]);

    fetchMock.mockResolvedValue(json({ data: [{ utmCampaign: null, pageviews: 2 }] }));
    expect(
      await client.aggregatePageviews({
        by: ["utmCampaign"],
        filter: "",
        from: "2026-09-01",
        to: "2026-09-02",
      }),
    ).toEqual([{ values: { utmCampaign: "" }, pageviews: 2 }]);
  });

  it("splits a day-grouped read into windows of at most 62 days", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = urlOf(input);
      return json({
        data: [{ timestamp: `${dayOfMs(url.searchParams.get("since"))}T00:00:00.000Z`, pageviews: 1 }],
      });
    });
    const client = new VercelAnalyticsClient(CONFIG);

    const groups = await client.aggregatePageviews({
      by: ["day"],
      filter: "",
      from: "2026-01-01",
      to: "2026-09-07",
    });

    const windows = fetchMock.mock.calls
      .map(([input]) => urlOf(input))
      .map((url) => ({
        from: dayOfMs(url.searchParams.get("since")),
        to: dayOfMs(url.searchParams.get("until")),
      }))
      .sort((a, b) => (a.from < b.from ? -1 : 1));
    expect(windows).toEqual([
      { from: "2026-01-01", to: "2026-03-03" },
      { from: "2026-03-04", to: "2026-05-04" },
      { from: "2026-05-05", to: "2026-07-05" },
      { from: "2026-07-06", to: "2026-09-05" },
      { from: "2026-09-06", to: "2026-09-07" },
    ]);
    expect(groups.map((group) => group.values.day).sort()).toEqual([
      "2026-01-01",
      "2026-03-04",
      "2026-05-05",
      "2026-07-06",
      "2026-09-06",
    ]);
  });

  it("halves a folded range until nothing folds, and sums the halves", async () => {
    // Four days, one view per campaign per day; any response spanning more
    // than one day is full and folds, as a response over the 100-group cap would.
    fetchMock.mockImplementation(async (input) => {
      const url = urlOf(input);
      const since = Number(url.searchParams.get("since"));
      const until = Number(url.searchParams.get("until"));
      const days = Math.round((until + 1 - since) / DAY_MS);
      if (days > 1) {
        return json(foldedResponse([{ utmCampaign: "lynx-a", pageviews: days }], days));
      }
      return json({
        data: [
          { utmCampaign: "lynx-a", pageviews: 1 },
          { utmCampaign: `lynx-${dayOfMs(String(since))}`, pageviews: 1 },
        ],
      });
    });
    const client = new VercelAnalyticsClient(CONFIG);

    const groups = await client.aggregatePageviews({
      by: ["utmCampaign"],
      filter: "",
      from: "2026-09-01",
      to: "2026-09-04",
    });

    const counts = Object.fromEntries(
      groups.map((group) => [group.values.utmCampaign, group.pageviews]),
    );
    expect(counts).toEqual({
      "lynx-a": 4,
      "lynx-2026-09-01": 1,
      "lynx-2026-09-02": 1,
      "lynx-2026-09-03": 1,
      "lynx-2026-09-04": 1,
    });
    expect(groups.some((group) => group.values.utmCampaign === "Others")).toBe(false);
  });

  it("counts a genuine \"Others\" campaign in a response under the cap", async () => {
    // Anyone can land on a page with ?utm_campaign=Others; a response that is
    // not full cannot have folded, so the row is that campaign's views.
    fetchMock.mockResolvedValue(
      json({
        data: [
          { utmCampaign: "lynx-a", pageviews: 5 },
          { utmCampaign: "Others", pageviews: 2 },
        ],
      }),
    );
    const client = new VercelAnalyticsClient(CONFIG);

    const groups = await client.aggregatePageviews({
      by: ["utmCampaign"],
      filter: "",
      from: "2026-09-01",
      to: "2026-09-04",
    });

    expect(groups).toEqual([
      { values: { utmCampaign: "lynx-a" }, pageviews: 5 },
      { values: { utmCampaign: "Others" }, pageviews: 2 },
    ]);
    // Counted from the one response, never halved.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws rather than answer a count that folds within a single day", async () => {
    fetchMock.mockImplementation(async () => json(foldedResponse([], 500)));
    const client = new VercelAnalyticsClient(CONFIG);
    await expect(
      client.aggregatePageviews({
        by: ["utmCampaign"],
        filter: "",
        from: "2026-09-01",
        to: "2026-09-02",
      }),
    ).rejects.toThrow(/Others.*single day/);
  });

  it("throws Vercel's refusal with its status", async () => {
    fetchMock.mockResolvedValue(new Response('{"error":{"code":"forbidden"}}', { status: 403 }));
    const client = new VercelAnalyticsClient(CONFIG);
    const read = client.aggregatePageviews({
      by: ["route"],
      filter: "",
      from: "2026-09-01",
      to: "2026-09-01",
    });
    await expect(read).rejects.toBeInstanceOf(VercelAnalyticsError);
    await expect(read).rejects.toMatchObject({ status: 403 });
  });

  it("throws on a response that is not the documented shape", async () => {
    fetchMock.mockResolvedValue(json({ data: [{ route: "/shop", visitors: 3 }] }));
    const client = new VercelAnalyticsClient(CONFIG);
    await expect(
      client.aggregatePageviews({ by: ["route"], filter: "", from: "2026-09-01", to: "2026-09-01" }),
    ).rejects.toThrow(/unexpected shape/);

    fetchMock.mockResolvedValue(json({ data: [{ pageviews: 3 }] }));
    await expect(
      client.aggregatePageviews({ by: ["route"], filter: "", from: "2026-09-01", to: "2026-09-01" }),
    ).rejects.toThrow(/without its route/);
  });

  it("keeps at most three calls in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    fetchMock.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return json({ data: [] });
    });
    const client = new VercelAnalyticsClient(CONFIG);

    await Promise.all(
      Array.from({ length: 10 }, () =>
        client.aggregatePageviews({
          by: ["route"],
          filter: "",
          from: "2026-09-01",
          to: "2026-09-01",
        }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(peak).toBe(3);
  });
});

describe("earliestTrafficDay", () => {
  it("is the day analytics was switched on until two years of retention pass it", () => {
    expect(earliestTrafficDay(new Date("2026-09-17T23:30:00Z"))).toBe("2026-05-31");
    expect(earliestTrafficDay(new Date("2028-05-31T12:00:00Z"))).toBe("2026-05-31");
    expect(earliestTrafficDay(new Date("2028-09-17T00:00:00Z"))).toBe("2026-09-17");
  });
});

describe("aggregateVisits", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns visitors beside pageviews, one window per 62 days of a day read", async () => {
    fetchMock.mockImplementation(async (input) => {
      const day = dayOfMs(urlOf(input).searchParams.get("since"));
      return json({ data: [{ timestamp: `${day}T00:00:00.000Z`, pageviews: 5, visitors: 2 }] });
    });
    const client = new VercelAnalyticsClient(CONFIG);

    const groups = await client.aggregateVisits({
      by: ["day"],
      filter: "",
      from: "2026-06-01",
      to: "2026-08-31",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(groups.sort((a, b) => ((a.values.day ?? "") < (b.values.day ?? "") ? -1 : 1))).toEqual([
      { values: { day: "2026-06-01" }, pageviews: 5, visitors: 2 },
      { values: { day: "2026-08-02" }, pageviews: 5, visitors: 2 },
    ]);
  });

  it("throws on a folded response rather than halving, since visitors do not add", async () => {
    fetchMock.mockResolvedValue(json(foldedResponse([{ utmCampaign: "a", pageviews: 1 }], 50)));
    const client = new VercelAnalyticsClient(CONFIG);

    await expect(
      client.aggregateVisits({ by: ["utmCampaign"], filter: "", from: "2026-09-01", to: "2026-09-30" }),
    ).rejects.toThrow(/visitors cannot be summed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on a row without visitors", async () => {
    fetchMock.mockResolvedValue(json({ data: [{ environment: "production", pageviews: 3 }] }));
    const client = new VercelAnalyticsClient(CONFIG);

    await expect(
      client.aggregateVisits({ by: ["environment"], filter: "", from: "2026-09-01", to: "2026-09-30" }),
    ).rejects.toThrow(/without its visitors/);
  });
});

describe("readServedPageLoadsUndocumented", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts one UTC day of the people-served filter to the observability query", async () => {
    fetchMock.mockResolvedValue(json({ summary: [{ vercel_request_count_sum: 653 }], data: [] }));

    expect(await readServedPageLoadsUndocumented(CONFIG, "2026-10-01")).toBe(653);

    const [input, init] = fetchMock.mock.calls[0];
    const url = urlOf(input);
    expect(`${url.origin}${url.pathname}`).toBe("https://api.vercel.com/v2/observability/query");
    expect(url.searchParams.get("teamId")).toBe("team_test");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer vercel-token");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      scope: { type: "project", ownerId: "team_test", projectIds: ["prj_test"] },
      metric: "vercel.request.count",
      aggregation: "sum",
      startTime: "2026-10-01T00:00:00.000Z",
      endTime: "2026-10-02T00:00:00.000Z",
      granularity: { days: 1 },
      filter: SERVED_PAGE_FILTER,
    });
  });

  it("reads a day with no matching request as zero", async () => {
    fetchMock.mockResolvedValue(json({ summary: [], data: [] }));
    expect(await readServedPageLoadsUndocumented(CONFIG, "2026-10-01")).toBe(0);
  });

  it("asks once more when Vercel's own query timed out, and no more", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ error: { code: "query_timeout", message: "Timeout" } }, 500))
      .mockResolvedValueOnce(json({ summary: [{ vercel_request_count_sum: 9 }] }));
    expect(await readServedPageLoadsUndocumented(CONFIG, "2026-10-01")).toBe(9);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    fetchMock.mockImplementation(async () =>
      json({ error: { code: "query_timeout", message: "Timeout" } }, 500),
    );
    await expect(readServedPageLoadsUndocumented(CONFIG, "2026-10-01")).rejects.toThrow(/query_timeout/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws on a refusal with Vercel's status, without asking again", async () => {
    fetchMock.mockResolvedValue(
      json({ error: { code: "not_found", message: "Observability Data not found." } }, 404),
    );
    const read = readServedPageLoadsUndocumented(CONFIG, "2026-10-01");
    await expect(read).rejects.toBeInstanceOf(VercelAnalyticsError);
    await expect(read).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on an unexpected shape", async () => {
    fetchMock.mockResolvedValue(json({ rows: [] }));
    await expect(readServedPageLoadsUndocumented(CONFIG, "2026-10-01")).rejects.toThrow(/unexpected shape/);
  });
});
