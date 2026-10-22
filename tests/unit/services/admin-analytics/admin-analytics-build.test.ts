import { describe, expect, it } from "vitest";

import { analyticsRouteFor } from "@/lib/analytics/route";
import {
  LANDING_PAGE_ROUTE,
  analyticsCacheKey,
  buildBreakdown,
  buildCampaigns,
  buildDayVisits,
  buildLandingPages,
  buildPathViews,
  buildRoutes,
  landingPagePaths,
  localePathFilter,
  normaliseUtm,
  pathLanguage,
  resolveAnalyticsRange,
  resolveRequestedRange,
  trafficPath,
  type LandingPageEntry,
} from "@/services/admin-analytics/admin-analytics.build";

/**
 * The pure half of the admin analytics page: the range, the cache key, and how
 * Vercel's groups are normalised and joined.
 */

const NOW = new Date("2026-10-15T09:30:00Z");
const EARLIEST = "2026-05-31";
const PAGE = "20000000-0000-4000-8000-000000000001";

describe("resolveAnalyticsRange", () => {
  it("opens on the last thirty UTC days, today included", () => {
    expect(resolveAnalyticsRange({}, NOW, EARLIEST)).toEqual({
      from: "2026-09-16",
      to: "2026-10-15",
      preset: 30,
    });
  });

  it("takes a preset, and ignores one it does not offer", () => {
    expect(resolveAnalyticsRange({ range: "7" }, NOW, EARLIEST)).toEqual({
      from: "2026-10-09",
      to: "2026-10-15",
      preset: 7,
    });
    expect(resolveAnalyticsRange({ range: "8" }, NOW, EARLIEST).preset).toBe(30);
    expect(resolveAnalyticsRange({ range: ["7", "90"] }, NOW, EARLIEST).preset).toBe(30);
  });

  it("clamps a preset reaching past the first day the data holds", () => {
    expect(resolveAnalyticsRange({ range: "90" }, new Date("2026-06-10T00:00:00Z"), EARLIEST)).toEqual({
      from: "2026-05-31",
      to: "2026-06-10",
      preset: 90,
    });
  });

  it("takes a custom range, turned the right way round and clamped to the data", () => {
    expect(resolveAnalyticsRange({ from: "2026-10-10", to: "2026-09-01" }, NOW, EARLIEST)).toEqual({
      from: "2026-09-01",
      to: "2026-10-10",
      preset: null,
    });
    expect(resolveAnalyticsRange({ from: "2026-01-01", to: "2027-01-01" }, NOW, EARLIEST)).toEqual({
      from: "2026-05-31",
      to: "2026-10-15",
      preset: null,
    });
  });

  it("falls back to the default on a malformed or impossible day", () => {
    expect(resolveAnalyticsRange({ from: "2026-02-30", to: "2026-10-01" }, NOW, EARLIEST).preset).toBe(30);
    expect(resolveAnalyticsRange({ from: "yesterday", to: "2026-10-01" }, NOW, EARLIEST).preset).toBe(30);
    expect(resolveAnalyticsRange({ from: "2026-10-01" }, NOW, EARLIEST).preset).toBe(30);
  });
});

describe("analyticsCacheKey", () => {
  it("is the read, its days and the current UTC hour", () => {
    expect(analyticsCacheKey("pages", { from: "2026-09-16", to: "2026-10-15" }, NOW)).toEqual({
      read: "pages",
      from: "2026-09-16",
      to: "2026-10-15",
      hour: "2026-10-15T09",
    });
  });

  it("changes with the hour and not within it, in UTC whatever the zone", () => {
    const range = { from: "2026-10-01", to: "2026-10-01" };
    const key = (iso: string) => analyticsCacheKey("x", range, new Date(iso)).hour;
    expect(key("2026-10-15T09:00:00Z")).toBe(key("2026-10-15T09:59:59Z"));
    expect(key("2026-10-15T09:59:59Z")).not.toBe(key("2026-10-15T10:00:00Z"));
    expect(key("2026-10-15T23:30:00+03:00")).toBe("2026-10-15T20");
  });
});

describe("normaliseUtm", () => {
  it("reads Vercel's empty string, a null and a missing value as the same none", () => {
    expect(normaliseUtm("")).toBeNull();
    expect(normaliseUtm(null)).toBeNull();
    expect(normaliseUtm(undefined)).toBeNull();
    expect(normaliseUtm("lynx-a")).toBe("lynx-a");
  });
});

describe("buildDayVisits", () => {
  const range = { from: "2026-10-01", to: "2026-10-03" };

  it("fills every day of the range, a day Vercel did not answer for at zero", () => {
    expect(
      buildDayVisits(range, [{ values: { day: "2026-10-02" }, pageviews: 9, visitors: 4 }]),
    ).toEqual([
      { day: "2026-10-01", pageviews: 0, visitors: 0 },
      { day: "2026-10-02", pageviews: 9, visitors: 4 },
      { day: "2026-10-03", pageviews: 0, visitors: 0 },
    ]);
  });

  it("throws on a bucket outside the range", () => {
    expect(() =>
      buildDayVisits(range, [{ values: { day: "2026-10-04" }, pageviews: 1, visitors: 1 }]),
    ).toThrow(/outside/);
  });
});

describe("buildCampaigns", () => {
  it("counts each campaign's views by its sources, naming its mediums, Vercel's empty string as no campaign", () => {
    const rows = buildCampaigns(
      [
        { values: { utmCampaign: "lynx-a", utmSource: "meta" }, pageviews: 60 },
        { values: { utmCampaign: "lynx-a", utmSource: "instagram" }, pageviews: 15 },
        { values: { utmCampaign: "", utmSource: "" }, pageviews: 900 },
        { values: { utmCampaign: "Lynx-A", utmSource: "meta" }, pageviews: 1 },
      ],
      [
        { values: { utmCampaign: "lynx-a", utmMedium: "paid_social" }, pageviews: 75 },
        { values: { utmCampaign: "", utmMedium: "" }, pageviews: 900 },
        { values: { utmCampaign: "Lynx-A", utmMedium: "paid_social" }, pageviews: 1 },
      ],
    );

    expect(rows.map((row) => [row.campaign, row.pageviews])).toEqual([
      ["lynx-a", 75],
      ["Lynx-A", 1],
      // "No campaign" last, however large.
      [null, 900],
    ]);
    expect(rows[0]?.sources).toEqual([
      { value: "meta", pageviews: 60 },
      { value: "instagram", pageviews: 15 },
    ]);
    expect(rows[0]?.mediums).toEqual([{ value: "paid_social", pageviews: 75 }]);
    expect(rows[2]?.sources).toEqual([{ value: null, pageviews: 900 }]);
  });

  it("is empty with nothing read", () => {
    expect(buildCampaigns([], [])).toEqual([]);
  });
});

describe("pages by route and language", () => {
  it("files a path under its locale prefix, or none", () => {
    expect(pathLanguage("/fi/kauppa")).toBe("fi");
    expect(pathLanguage("/fi")).toBe("fi");
    expect(pathLanguage("/shop/1")).toBe("none");
    expect(pathLanguage("/finland")).toBe("none");
    expect(localePathFilter("sv")).toBe("(requestPath eq '/sv' or startswith(requestPath, '/sv/'))");
  });

  it("splits each route by language, the unclaimed rest being unprefixed paths", () => {
    const rows = buildRoutes(
      [
        { values: { route: "/shop" }, pageviews: 100 },
        { values: { route: "/" }, pageviews: 30 },
      ],
      new Map([
        ["fi", [{ values: { route: "/shop" }, pageviews: 70 }]],
        ["en", [{ values: { route: "/shop" }, pageviews: 20 }, { values: { route: "/" }, pageviews: 30 }]],
      ]),
    );
    expect(rows).toEqual([
      {
        route: "/shop",
        pageviews: 100,
        languages: [
          { language: "fi", pageviews: 70 },
          { language: "en", pageviews: 20 },
          { language: "none", pageviews: 10 },
        ],
      },
      { route: "/", pageviews: 30, languages: [{ language: "en", pageviews: 30 }] },
    ]);
  });

  it("drops the split of a route whose locale reads claim more than its total", () => {
    const rows = buildRoutes(
      [{ values: { route: "/shop" }, pageviews: 10 }],
      new Map([["fi", [{ values: { route: "/shop" }, pageviews: 11 }]]]),
    );
    expect(rows).toEqual([{ route: "/shop", pageviews: 10, languages: [] }]);
  });
});

describe("landing pages", () => {
  const page: LandingPageEntry = {
    id: PAGE,
    versions: [
      { locale: "en", title: "Clubs in Espoo" },
      { locale: "fi", title: "Kerhot Espoossa" },
    ],
    slugs: [
      { locale: "en", slug: "espoo-clubs" },
      { locale: "fi", slug: "espoon-kerhot" },
      { locale: "fi", slug: "espoo-vanha" },
    ],
  };

  it("is the route every landing page's views are filed under, in every language", () => {
    expect(analyticsRouteFor("/fi/tutustu/espoon-kerhot")).toBe(LANDING_PAGE_ROUTE);
    expect(analyticsRouteFor("/en/discover/espoo-clubs")).toBe(LANDING_PAGE_ROUTE);
    expect(analyticsRouteFor("/sv/upptack/x")).toBe(LANDING_PAGE_ROUTE);
  });

  it("is served at its id in every locale and at each slug in its own", () => {
    const paths = landingPagePaths(page);
    expect(paths).toContain(`/fr/decouvrir/${PAGE}`);
    expect(paths).toContain("/fi/tutustu/espoon-kerhot");
    expect(paths).toContain("/fi/tutustu/espoo-vanha");
    expect(paths).toContain("/en/discover/espoo-clubs");
    expect(paths).not.toContain("/en/discover/espoon-kerhot");
  });

  it("files views under the page, and keeps a path no page answers to as its own row", () => {
    const rows = buildLandingPages(
      [
        { values: { requestPath: "/fi/tutustu/espoon-kerhot" }, pageviews: 40 },
        { values: { requestPath: "/fi/tutustu/espoo-vanha" }, pageviews: 5 },
        { values: { requestPath: `/en/discover/${PAGE}` }, pageviews: 3 },
        { values: { requestPath: "/en/discover/gone" }, pageviews: 90 },
        { values: { requestPath: "/en/discover/nothing" }, pageviews: 0 },
      ],
      [page],
    );
    expect(rows).toEqual([
      {
        page: { id: PAGE, versions: page.versions },
        path: null,
        pageviews: 48,
        languages: [
          { language: "fi", pageviews: 45 },
          { language: "en", pageviews: 3 },
        ],
      },
      {
        page: null,
        path: "/en/discover/gone",
        pageviews: 90,
        languages: [{ language: "en", pageviews: 90 }],
      },
    ]);
  });
});

describe("buildBreakdown", () => {
  it("merges the empty value into one null row, most viewed first", () => {
    expect(
      buildBreakdown(
        [
          { values: { referrerHostname: "" }, pageviews: 10 },
          { values: { referrerHostname: "google.com" }, pageviews: 20 },
          { values: { referrerHostname: "m.facebook.com" }, pageviews: 0 },
        ],
        "referrerHostname",
      ),
    ).toEqual([
      { value: "google.com", pageviews: 20 },
      { value: null, pageviews: 10 },
    ]);
  });
});

describe("resolveRequestedRange", () => {
  it("reads lastDays as the last N UTC days, today included", () => {
    expect(resolveRequestedRange({ lastDays: 7 }, NOW, EARLIEST)).toEqual({
      ok: true,
      from: "2026-10-09",
      to: "2026-10-15",
      adjusted: null,
    });
  });

  it("reads a reversed pair the right way round", () => {
    expect(resolveRequestedRange({ from: "2026-10-10", to: "2026-10-01" }, NOW, EARLIEST)).toEqual({
      ok: true,
      from: "2026-10-01",
      to: "2026-10-10",
      adjusted: null,
    });
  });

  it("narrows a range reaching outside the counts, and says so", () => {
    const result = resolveRequestedRange({ from: "2026-01-01", to: "2026-12-31" }, NOW, EARLIEST);
    expect(result).toMatchObject({ ok: true, from: EARLIEST, to: "2026-10-15" });
    expect(result.ok && result.adjusted).toBe(
      "The range was narrowed: it starts at 2026-05-31, the first UTC day the counts reach back to and ends today, 2026-10-15 (UTC).",
    );
  });

  it("refuses a range wholly before the counts or wholly in the future", () => {
    expect(resolveRequestedRange({ from: "2026-01-01", to: "2026-02-01" }, NOW, EARLIEST)).toEqual({
      ok: false,
      reason: "There are no figures before 2026-05-31, the first UTC day the counts reach back to.",
    });
    expect(resolveRequestedRange({ from: "2026-11-01", to: "2026-11-02" }, NOW, EARLIEST)).toEqual({
      ok: false,
      reason: "2026-11-01 has not happened yet: today is 2026-10-15 (UTC).",
    });
  });
});

describe("trafficPath", () => {
  it("counts a path with a language prefix as that address alone", () => {
    expect(trafficPath("/fi/kauppa")).toEqual({
      given: "/fi/kauppa",
      locale: "fi",
      addresses: ["/fi/kauppa"],
    });
  });

  it("counts a locale-less path in every language's own address", () => {
    expect(trafficPath("/shop")?.addresses).toEqual([
      "/shop",
      "/en/shop",
      "/fi/kauppa",
      "/sv/butik",
      "/fr/boutique",
      "/tlh/shop",
    ]);
  });

  it("untranslates a translated path before putting it back into every language", () => {
    expect(trafficPath("/kauppa")?.addresses).toEqual(
      expect.arrayContaining(["/kauppa", "/en/shop", "/fi/kauppa", "/sv/butik"]),
    );
  });

  it("puts a landing page's id into every language's own landing segment", () => {
    expect(trafficPath(`/discover/${PAGE}`)?.addresses).toEqual([
      `/discover/${PAGE}`,
      `/en/discover/${PAGE}`,
      `/fi/tutustu/${PAGE}`,
      `/sv/upptack/${PAGE}`,
      `/fr/decouvrir/${PAGE}`,
      `/tlh/discover/${PAGE}`,
    ]);
  });

  it("reads a full address as its path, dropping the query, the fragment and a trailing slash", () => {
    expect(trafficPath("https://sog.gg/fi/discover/pelaaja/?utm_source=meta#top")).toEqual({
      given: "https://sog.gg/fi/discover/pelaaja/?utm_source=meta#top",
      locale: "fi",
      addresses: ["/fi/discover/pelaaja"],
    });
  });

  it("counts a language's home at its bare prefix", () => {
    expect(trafficPath("/sv/")?.addresses).toEqual(["/sv"]);
    expect(trafficPath("/")?.addresses).toEqual(["/", "/en", "/fi", "/sv", "/fr", "/tlh"]);
  });

  it("refuses what is not a path", () => {
    expect(trafficPath("shop")).toBeNull();
    expect(trafficPath("mailto:someone@example.com")).toBeNull();
  });
});

describe("buildPathViews", () => {
  it("files each address's views under every asked-for path that counts it", () => {
    const shop = trafficPath("/shop");
    const finnish = trafficPath("/fi/kauppa");
    if (shop === null || finnish === null) throw new Error("unreachable");
    expect(
      buildPathViews(
        [
          { values: { requestPath: "/en/shop" }, pageviews: 5 },
          { values: { requestPath: "/fi/kauppa" }, pageviews: 8 },
        ],
        [shop, finnish],
      ),
    ).toEqual([
      {
        given: "/shop",
        pageviews: 13,
        addresses: [
          { path: "/fi/kauppa", language: "fi", pageviews: 8 },
          { path: "/en/shop", language: "en", pageviews: 5 },
        ],
      },
      { given: "/fi/kauppa", pageviews: 8, addresses: [{ path: "/fi/kauppa", language: "fi", pageviews: 8 }] },
    ]);
  });
});
