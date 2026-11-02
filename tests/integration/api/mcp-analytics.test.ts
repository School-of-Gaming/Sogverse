import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_ORIGIN } from "../../mocks/site-origin";
import { z } from "zod";
import { callTool, mcpRequest, readRpc, resultText } from "../../helpers/mcp";

/**
 * **The analytics tools, through the real endpoint.** The real gate, SDK and
 * tool module over the admin Analytics page's own reads, which are mocked:
 * what is under test is how each tool reads its input — the range, the paths
 * and how they are matched across languages, the campaign labels — what it
 * asks the reads for, and how it hands their answers and refusals to the AI
 * app. The reads themselves are tested in the service's own unit tests.
 */

const mockGetClaims = vi.fn();
const mockMaybeSingle = vi.fn();
const bearerClient = vi.hoisted(() => ({ tag: "bearer client" }));
vi.mock("@/lib/supabase/bearer", () => ({
  createBearerClient: () => ({
    ...bearerClient,
    auth: { getClaims: mockGetClaims },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  }),
}));

const reads = vi.hoisted(() => ({
  readWebAnalyticsOverview: vi.fn(),
  readPathViews: vi.fn(),
  readTopPages: vi.fn(),
  readBreakdowns: vi.fn(),
  readCampaigns: vi.fn(),
  readLandingPages: vi.fn(),
}));
vi.mock("@/services/admin-analytics/admin-analytics.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/admin-analytics/admin-analytics.server")>()),
  ...reads,
}));

const { POST } = await import("@/app/api/mcp/route");

const tool = (name: string, args: Record<string, unknown> = {}) => callTool(POST, name, args);

const SUPABASE_URL = "https://project.supabase.co";
const CLIENT_ID = "5b0a3f0e-1c55-4c43-8d2e-6a7f3f0f2a90";
const PAGE = "20000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-15T09:30:00Z");
const READ_AT = "2026-10-15T09:00:00.000Z";

const OVERVIEW = {
  ok: true,
  readAt: READ_AT,
  data: {
    days: [
      { day: "2026-10-14", pageviews: 10, visitors: 4 },
      { day: "2026-10-15", pageviews: 5, visitors: 3 },
    ],
    pageviews: 15,
    visitors: 6,
  },
};

const REFUSED = { ok: false, reason: "refused" };

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
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
  for (const read of Object.values(reads)) read.mockReset();
  reads.readWebAnalyticsOverview.mockResolvedValue(OVERVIEW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function listedTools() {
  const body = await readRpc(await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" })));
  return z
    .object({
      tools: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          annotations: z.object({ readOnlyHint: z.boolean(), destructiveHint: z.boolean() }),
        }),
      ),
    })
    .parse(body.result)
    .tools.filter((listed) => listed.name.includes("analytics"));
}

describe("the manual", () => {
  it("lists both tools read-only, each carrying the caveats the AI app must relay", async () => {
    const tools = await listedTools();
    expect(tools.map((listed) => listed.name)).toEqual(["get_analytics_summary", "get_analytics_breakdown"]);
    for (const listed of tools) {
      expect(listed.annotations).toEqual({ readOnlyHint: true, destructiveHint: false });
      expect(listed.description).toContain("count only visitors who accepted analytics cookies, so real traffic is higher");
      expect(listed.description).toContain("Every day is a UTC day");
      expect(listed.description).toContain("Button clicks are not recorded");
    }
  });

  it("tells the summary's caller how paths match and where landing pages live", async () => {
    const [summary] = await listedTools();
    expect(summary.description).toContain("counts that address only");
    expect(summary.description).toContain("counts the page in every language");
    expect(summary.description).toContain("/en/discover/<slug or id>, /fi/tutustu/<slug or id>");
    expect(summary.description).toContain("get_landing_page lists them");
  });
});

describe("get_analytics_summary", () => {
  it("answers the whole site over the last 30 days by default", async () => {
    const result = await tool("get_analytics_summary");

    expect(result.isError).toBeUndefined();
    const range = { from: "2026-09-16", to: "2026-10-15" };
    expect(reads.readWebAnalyticsOverview).toHaveBeenCalledWith(range, NOW, undefined);
    expect(reads.readPathViews).not.toHaveBeenCalled();
    expect(result.structuredContent).toEqual({
      range: { ...range, days: 30, timeZone: "UTC", adjusted: null },
      filters: { paths: [], campaign: null, source: null, medium: null },
      webAnalytics: { available: true, pageviews: 15, visitors: 6, readAt: READ_AT },
    });
    // Repeated as text for clients that read only that.
    expect(JSON.parse(resultText(result))).toEqual(result.structuredContent);
  });

  it("matches a locale-less path in every language and a prefixed one as that address", async () => {
    reads.readPathViews.mockResolvedValue({
      ok: true,
      readAt: READ_AT,
      data: [{ given: "/shop", pageviews: 3, addresses: [{ path: "/fi/kauppa", language: "fi", pageviews: 3 }] }],
    });

    const result = await tool("get_analytics_summary", {
      lastDays: 7,
      paths: ["/shop", `${SITE_ORIGIN}/fi/tutustu/${PAGE}?utm_source=meta`],
    });

    const filter = {
      paths: [
        {
          given: "/shop",
          locale: null,
          addresses: ["/shop", "/en/shop", "/fi/kauppa", "/sv/butik", "/fr/boutique", "/tlh/shop"],
        },
        {
          given: `${SITE_ORIGIN}/fi/tutustu/${PAGE}?utm_source=meta`,
          locale: "fi",
          addresses: [`/fi/tutustu/${PAGE}`],
        },
      ],
    };
    expect(reads.readWebAnalyticsOverview).toHaveBeenCalledWith(expect.anything(), NOW, filter);
    expect(reads.readPathViews).toHaveBeenCalledWith(expect.anything(), NOW, filter);

    expect(result.structuredContent).toMatchObject({
      filters: {
        paths: [
          { given: "/shop", matching: "every language" },
          { given: `${SITE_ORIGIN}/fi/tutustu/${PAGE}?utm_source=meta`, matching: "this address only" },
        ],
      },
      byPath: [{ given: "/shop", pageviews: 3 }],
    });
  });

  it("narrows to the campaign labels asked for", async () => {
    const result = await tool("get_analytics_summary", { campaign: "lynx-a", source: "meta" });

    expect(reads.readWebAnalyticsOverview).toHaveBeenCalledWith(expect.anything(), NOW, {
      paths: [],
      campaign: "lynx-a",
      source: "meta",
    });
    expect(reads.readPathViews).not.toHaveBeenCalled();
    expect(result.structuredContent?.filters).toEqual({
      paths: [],
      campaign: "lynx-a",
      source: "meta",
      medium: null,
    });
  });

  it("adds a row per day on request", async () => {
    const result = await tool("get_analytics_summary", { from: "2026-10-14", to: "2026-10-15", includeDays: true });
    expect(result.structuredContent?.days).toEqual([
      { day: "2026-10-14", pageviews: 10, visitors: 4 },
      { day: "2026-10-15", pageviews: 5, visitors: 3 },
    ]);
  });

  it("surfaces a refusal as unavailable with its explanation, not as a tool error", async () => {
    reads.readWebAnalyticsOverview.mockResolvedValue(REFUSED);

    const result = await tool("get_analytics_summary", { includeDays: true });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      webAnalytics: { available: false, reason: "refused", explanation: expect.stringContaining('"Vercel refused"') },
      days: null,
    });
  });

  it("says when the range was narrowed to the days counts exist on", async () => {
    const result = await tool("get_analytics_summary", { from: "2026-01-01", to: "2026-06-01" });
    expect(result.structuredContent?.range).toEqual({
      from: "2026-05-31",
      to: "2026-06-01",
      days: 2,
      timeZone: "UTC",
      adjusted: expect.stringContaining("starts at 2026-05-31"),
    });
  });

  it.each([
    [{ from: "2026-10-01" }, "Give from and to together."],
    [{ from: "2026-10-01", to: "2026-10-02", lastDays: 7 }, "Give either from and to, or lastDays, not both."],
    [{ from: "2025-01-01", to: "2025-02-01" }, "There are no figures before 2026-05-31"],
    [{ from: "2026-11-01", to: "2026-11-02" }, "2026-11-01 has not happened yet"],
    [{ paths: ["shop"] }, '"shop" is not a path'],
  ])("refuses %j before reading anything", async (args, text) => {
    const result = await tool("get_analytics_summary", args);
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain(text);
    expect(reads.readWebAnalyticsOverview).not.toHaveBeenCalled();
  });

  it("refuses a day that is not a calendar day at the schema", async () => {
    const result = await tool("get_analytics_summary", { from: "2026-02-30", to: "2026-03-01" });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("Expected a UTC day as YYYY-MM-DD.");
  });

  it("refuses more addresses than Vercel takes in one filter", async () => {
    const paths = Array.from({ length: 20 }, (_, i) => `/discover/a-rather-long-landing-page-slug-${i}`);
    const result = await tool("get_analytics_summary", { paths });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("more addresses than Vercel takes in one question");
    expect(reads.readWebAnalyticsOverview).not.toHaveBeenCalled();
  });

  it("answers a fault on our side with a generic line, not its developer detail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    reads.readWebAnalyticsOverview.mockRejectedValue(new Error("TypeError: cannot read x of undefined"));
    const result = await tool("get_analytics_summary");
    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe("Sogverse could not read the analytics. Asking again may work.");
  });
});

describe("get_analytics_breakdown", () => {
  it("answers the campaigns table, cut to the limit", async () => {
    reads.readCampaigns.mockResolvedValue({
      ok: true,
      readAt: READ_AT,
      data: [
        { campaign: "lynx-a", pageviews: 30, sources: [], mediums: [] },
        { campaign: "rblx-launch", pageviews: 10, sources: [], mediums: [] },
        { campaign: null, pageviews: 500, sources: [], mediums: [] },
      ],
    });

    const result = await tool("get_analytics_breakdown", { by: "campaigns", lastDays: 7, limit: 2 });

    expect(reads.readCampaigns).toHaveBeenCalledWith({ from: "2026-10-09", to: "2026-10-15" }, NOW);
    expect(result.structuredContent).toEqual({
      range: { from: "2026-10-09", to: "2026-10-15", days: 7, timeZone: "UTC", adjusted: null },
      by: "campaigns",
      rows: [
        { campaign: "lynx-a", pageviews: 30, sources: [], mediums: [] },
        { campaign: "rblx-launch", pageviews: 10, sources: [], mediums: [] },
      ],
      totalRows: 3,
      truncated: true,
      readAt: READ_AT,
    });
  });

  it("names each landing page by the id the landing page tools use", async () => {
    reads.readLandingPages.mockResolvedValue({
      ok: true,
      readAt: READ_AT,
      data: [
        {
          page: { id: PAGE, versions: [{ locale: "fi", title: "Lapseni on pelaaja" }] },
          path: null,
          pageviews: 12,
          languages: [{ language: "fi", pageviews: 12 }],
        },
        { page: null, path: "/en/discover/old-slug", pageviews: 1, languages: [{ language: "en", pageviews: 1 }] },
      ],
    });

    const result = await tool("get_analytics_breakdown", { by: "landing_pages" });

    // The landing page directory is read on the admin's own token-bound client.
    expect(reads.readLandingPages).toHaveBeenCalledWith(
      expect.anything(),
      NOW,
      expect.objectContaining(bearerClient),
    );
    expect(result.structuredContent?.rows).toEqual([
      {
        landingPageId: PAGE,
        titles: [{ locale: "fi", title: "Lapseni on pelaaja" }],
        path: null,
        pageviews: 12,
        languages: [{ language: "fi", pageviews: 12 }],
      },
      {
        landingPageId: null,
        titles: [],
        path: "/en/discover/old-slug",
        pageviews: 1,
        languages: [{ language: "en", pageviews: 1 }],
      },
    ]);
  });

  it("answers one of the one-dimension breakdowns", async () => {
    reads.readBreakdowns.mockResolvedValue({
      ok: true,
      readAt: READ_AT,
      data: { referrers: [{ value: "facebook.com", pageviews: 9 }], countries: [], devices: [] },
    });
    const result = await tool("get_analytics_breakdown", { by: "referrers" });
    expect(result.structuredContent?.rows).toEqual([{ value: "facebook.com", pageviews: 9 }]);
  });

  it("is a tool error saying Vercel refused when it refuses the token", async () => {
    reads.readTopPages.mockResolvedValue(REFUSED);
    const result = await tool("get_analytics_breakdown", { by: "pages" });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('Vercel refused the analytics token for Web Analytics (the Analytics page shows "Vercel refused")');
  });

  it("names both sources when the landing pages table fails", async () => {
    reads.readLandingPages.mockResolvedValue({ ok: false, reason: "failed" });
    const result = await tool("get_analytics_breakdown", { by: "landing_pages" });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain("Vercel or Sogverse's own database did not answer");
  });

  it("answers an empty table as no rows, not as a failure", async () => {
    reads.readTopPages.mockResolvedValue({ ok: true, readAt: READ_AT, data: [] });
    const result = await tool("get_analytics_breakdown", { by: "pages" });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ rows: [], totalRows: 0, truncated: false });
  });
});
