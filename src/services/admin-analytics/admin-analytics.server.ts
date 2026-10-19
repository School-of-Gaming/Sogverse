import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";

import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/constants/locales";
import { walkPages } from "@/lib/supabase/paging";
import { createClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/types";
import {
  REQUEST_LOG_DAYS,
  VercelAnalyticsClient,
  VercelAnalyticsError,
  odataString,
  readServedPageLoadsUndocumented,
  vercelAnalyticsConfig,
  type PageviewsGroup,
  type VercelAnalyticsConfig,
} from "@/lib/vercel-analytics.server";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";
import {
  LANDING_PAGE_ROUTE,
  addDays,
  analyticsCacheKey,
  buildBreakdown,
  buildCampaigns,
  buildDayVisits,
  buildLandingPages,
  buildPathViews,
  buildRoutes,
  daysOf,
  localePathFilter,
  requestLogWindow,
  tallySignups,
  utcToday,
  type AnalyticsCacheKey,
  type AnalyticsResult,
  type BreakdownRow,
  type CampaignLabels,
  type CampaignRow,
  type LandingPageEntry,
  type LandingPageRow,
  type PathViewsRow,
  type RouteRow,
  type ServedPageLoads,
  type SignupTally,
  type TrafficPath,
  type WebAnalyticsOverview,
} from "./admin-analytics.build";

/**
 * The admin analytics page's reads: Vercel Web Analytics, the edge request
 * log, and the parent accounts in Sogverse's own database.
 *
 * **Every Vercel read is server-only and cached for the hour.** The token reads
 * every page of the project, so it never leaves the server, and each read is
 * stored in Next's data cache under `analyticsCacheKey` — the read, its days and
 * the current UTC hour — so admins clicking through ranges reuse one another's
 * reads and cannot run the endpoint's 400-a-minute limit down. The database
 * read is not cached: it is the caller's own session, under the admin policy on
 * `profiles`.
 *
 * **Every read answers on its own.** Each returns an `AnalyticsResult`, and a
 * failure is logged in full here and handed to its section as a reason, never as
 * zeros — so the request log being unreachable leaves the Web Analytics figures
 * standing, and the other way round.
 *
 * The page is behind the proxy's admin gate, and its route checks the role
 * again before calling anything here. The MCP analytics tools
 * (`src/lib/mcp/analytics.ts`) read through these same functions behind the
 * MCP gate, handing in the admin's own token-bound client where a read touches
 * the database; the page leaves it out and reads on its own session.
 */

/** Views on production only, stated on every filter rather than left to the endpoint's default. */
const PRODUCTION = `environment eq ${odataString("production")}`;

const ONE_HOUR_S = 3600;

/**
 * What a failed Vercel read is reported as: a refusal of the token itself —
 * 401, 403, or the 404 the request log answers a token it will not serve — is
 * `refused`, because trying again in a minute will not change it.
 */
function failureReason(error: unknown): "refused" | "failed" {
  return error instanceof VercelAnalyticsError && [401, 403, 404].includes(error.status)
    ? "refused"
    : "failed";
}

/** The configuration, or null when a variable is unset — logged once per request. */
const analyticsConfig = cache((): VercelAnalyticsConfig | null => {
  const analytics = vercelAnalyticsConfig();
  if (analytics.ok) return analytics.config;
  console.error(
    `admin analytics: Vercel Web Analytics is not configured (${analytics.missing.join(", ")} unset)`,
  );
  return null;
});

/** One client per request, so every read in it shares the client's concurrency limit. */
const analyticsClient = cache((config: VercelAnalyticsConfig) => new VercelAnalyticsClient(config));

/**
 * One Vercel read, cached for the hour under its normalised key, with its
 * failure turned into a reason. `compute` is handed the key it is cached under,
 * never the raw range, so nothing it reads can differ from what it is stored as.
 */
async function vercelRead<T>(
  read: string,
  range: { from: string; to: string },
  now: Date,
  compute: (client: VercelAnalyticsClient, key: AnalyticsCacheKey) => Promise<T>,
): Promise<AnalyticsResult<T>> {
  const config = analyticsConfig();
  if (config === null) return { ok: false, reason: "unconfigured" };
  const client = analyticsClient(config);
  try {
    const cached = unstable_cache(
      async (key: AnalyticsCacheKey) => ({
        data: await compute(client, key),
        readAt: new Date().toISOString(),
      }),
      ["admin-analytics", read],
      { revalidate: ONE_HOUR_S },
    );
    const { data, readAt } = await cached(analyticsCacheKey(read, range, now));
    return { ok: true, data, readAt };
  } catch (error) {
    console.error(`admin analytics: the ${read} read failed`, error);
    return { ok: false, reason: failureReason(error) };
  }
}

// ---------------------------------------------------------------------------
// Web Analytics: consenting visitors only
// ---------------------------------------------------------------------------

/** What a Web Analytics read can be narrowed to: some pages, and campaign labels. */
export interface TrafficFilter extends CampaignLabels {
  paths: readonly TrafficPath[];
}

/**
 * The whole OData filter for `filter`: production, any of the paths'
 * addresses, and every campaign label given, matched exactly. A caller sizes
 * it against `MAX_FILTER_LENGTH` before reading, since Vercel refuses a longer
 * one.
 */
export function trafficFilterExpression(filter: TrafficFilter): string {
  const addresses = [...new Set(filter.paths.flatMap((path) => path.addresses))];
  const labels: [string, string | undefined][] = [
    ["utmCampaign", filter.campaign],
    ["utmSource", filter.source],
    ["utmMedium", filter.medium],
  ];
  return [
    PRODUCTION,
    ...(addresses.length === 0
      ? []
      : [`(${addresses.map((address) => `requestPath eq ${odataString(address)}`).join(" or ")})`]),
    ...labels.flatMap(([dimension, value]) =>
      value === undefined ? [] : [`${dimension} eq ${odataString(value)}`],
    ),
  ].join(" and ");
}

/**
 * Pageviews and visitors per UTC day, and across the whole range: the whole
 * site, or what `filter` narrows it to, cached under its own filter.
 * Memoised per request as well, because the measure and the over-time chart
 * both want it and a cold hour would otherwise read it twice.
 */
export const readWebAnalyticsOverview = cache(function readWebAnalyticsOverview(
  range: { from: string; to: string },
  now: Date,
  filter?: TrafficFilter,
): Promise<AnalyticsResult<WebAnalyticsOverview>> {
  const expression = filter === undefined ? PRODUCTION : trafficFilterExpression(filter);
  const read = expression === PRODUCTION ? "overview" : `overview ${expression}`;
  return vercelRead(read, range, now, async (client, key) => {
    const query = { filter: expression, from: key.from, to: key.to };
    const [byDay, whole] = await Promise.all([
      client.aggregateVisits({ ...query, by: ["day"] }),
      // Grouped by environment, which the filter pins to one value: one row for
      // the range, whose visitors are distinct across all of it.
      client.aggregateVisits({ ...query, by: ["environment"] }),
    ]);
    if (whole.length > 1) {
      throw new Error(`analytics: the range total answered ${whole.length} rows, not one`);
    }
    return {
      days: buildDayVisits(key, byDay),
      pageviews: whole[0]?.pageviews ?? 0,
      visitors: whole[0]?.visitors ?? 0,
    };
  });
});

/**
 * Each of `filter`'s paths' pageviews, address by address, under its campaign
 * labels too. Only Vercel's groups are cached, under the filter's addresses:
 * two path lists sharing those addresses share the read, and each is then
 * filed under its own paths.
 */
export async function readPathViews(
  range: { from: string; to: string },
  now: Date,
  filter: TrafficFilter,
): Promise<AnalyticsResult<PathViewsRow[]>> {
  const expression = trafficFilterExpression(filter);
  const views = await vercelRead(`paths ${expression}`, range, now, (client, key) =>
    client.aggregatePageviews({
      by: ["requestPath"],
      filter: expression,
      from: key.from,
      to: key.to,
    }),
  );
  if (!views.ok) return views;
  return { ok: true, data: buildPathViews(views.data, filter.paths), readAt: views.readAt };
}

/** The top pages, one row per route across every language, each with its language split. */
export function readTopPages(
  range: { from: string; to: string },
  now: Date,
): Promise<AnalyticsResult<RouteRow[]>> {
  return vercelRead("pages", range, now, async (client, key) => {
    const query = { from: key.from, to: key.to, by: ["route"] as const };
    const [byRoute, ...perLocale] = await Promise.all([
      client.aggregatePageviews({ ...query, filter: PRODUCTION }),
      ...SUPPORTED_LOCALES.map((locale) =>
        client.aggregatePageviews({
          ...query,
          filter: `${PRODUCTION} and ${localePathFilter(locale)}`,
        }),
      ),
    ]);
    const byLocale = new Map<SupportedLocale, PageviewsGroup[]>(
      SUPPORTED_LOCALES.map((locale, index) => [locale, perLocale[index] ?? []]),
    );
    return buildRoutes(byRoute, byLocale);
  });
}

/** Referrer, country and device, each by pageviews. */
export interface Breakdowns {
  referrers: BreakdownRow[];
  countries: BreakdownRow[];
  devices: BreakdownRow[];
}

export function readBreakdowns(
  range: { from: string; to: string },
  now: Date,
): Promise<AnalyticsResult<Breakdowns>> {
  return vercelRead("breakdowns", range, now, async (client, key) => {
    const query = { filter: PRODUCTION, from: key.from, to: key.to };
    const [referrers, countries, devices] = await Promise.all([
      client.aggregatePageviews({ ...query, by: ["referrerHostname"] }),
      client.aggregatePageviews({ ...query, by: ["country"] }),
      client.aggregatePageviews({ ...query, by: ["deviceType"] }),
    ]);
    return {
      referrers: buildBreakdown(referrers, "referrerHostname"),
      countries: buildBreakdown(countries, "country"),
      devices: buildBreakdown(devices, "deviceType"),
    };
  });
}

// ---------------------------------------------------------------------------
// The edge request log: every visitor
// ---------------------------------------------------------------------------

/**
 * Pages served to people per UTC day, from the edge request log, for the days
 * of the range the log still holds.
 *
 * Read one day per call and cached per day for the hour, so a wider range
 * reuses the days a narrower one already read. The read goes through the
 * undocumented observability query, so a failure on any day fails the whole
 * measure rather than leaving a gap that looks like a quiet day. Memoised per
 * request, because the measure and the over-time chart both want it.
 */
export const readServedPageLoads = cache(async function readServedPageLoads(
  range: { from: string; to: string },
  now: Date,
): Promise<AnalyticsResult<ServedPageLoads>> {
  const config = analyticsConfig();
  if (config === null) return { ok: false, reason: "unconfigured" };

  const window = requestLogWindow(range, utcToday(now), REQUEST_LOG_DAYS);
  if (window === null) {
    return { ok: true, data: { window, days: [], total: 0 }, readAt: now.toISOString() };
  }

  const readDay = unstable_cache(
    async (key: AnalyticsCacheKey) => ({
      count: await readServedPageLoadsUndocumented(config, key.from),
      readAt: new Date().toISOString(),
    }),
    ["admin-analytics", "served"],
    { revalidate: ONE_HOUR_S },
  );
  try {
    const days = await Promise.all(
      daysOf(window.from, window.to).map(async (day) => ({
        day,
        ...(await readDay(analyticsCacheKey("served", { from: day, to: day }, now))),
      })),
    );
    return {
      ok: true,
      data: {
        window,
        days: days.map(({ day, count }) => ({ day, count })),
        total: days.reduce((sum, { count }) => sum + count, 0),
      },
      // The oldest day's read, which is how old the measure is.
      readAt: days.map((day) => day.readAt).sort()[0] ?? now.toISOString(),
    };
  } catch (error) {
    console.error("admin analytics: the request log read failed", error);
    return { ok: false, reason: failureReason(error) };
  }
});

// ---------------------------------------------------------------------------
// Signups: Sogverse's own parent accounts
// ---------------------------------------------------------------------------

/**
 * The client a database read runs on: the one handed in (an MCP tool's, bound
 * to the admin's token), or else the page's own session.
 *
 * Awaited outside a read's `try`: building the session client reads cookies,
 * and a dynamic-render signal travels as a thrown control-flow object that
 * must not be reported as a failed read.
 */
async function databaseClient(client: AppSupabaseClient | undefined): Promise<AppSupabaseClient> {
  return client ?? (await createClient());
}

/**
 * The parent accounts created in the range, counted per UTC day and per
 * campaign label triple. Read under the caller's own session — the admin policy
 * on `profiles` admits every row — and reduced to counts before anything leaves
 * this function. Memoised per request, because the over-time chart and the
 * campaigns table both want it.
 */
export const readSignups = cache(
  async (
    from: string,
    to: string,
    client?: AppSupabaseClient,
  ): Promise<AnalyticsResult<SignupTally>> => {
    const supabase = await databaseClient(client);
    try {
      const rows = await walkPages("admin analytics signups", (start, end) =>
        supabase
          .from("profiles")
          .select("created_at, utm_source, utm_medium, utm_campaign", { count: "exact" })
          .eq("role", "customer")
          .gte("created_at", `${from}T00:00:00.000Z`)
          .lt("created_at", `${addDays(to, 1)}T00:00:00.000Z`)
          .order("created_at", { ascending: false })
          .order("id")
          .range(start, end),
      );
      return { ok: true, data: tallySignups({ from, to }, rows), readAt: new Date().toISOString() };
    } catch (error) {
      console.error("admin analytics: the signups read failed", error);
      return { ok: false, reason: "failed" };
    }
  },
);

// ---------------------------------------------------------------------------
// Joined reads
// ---------------------------------------------------------------------------

/** Campaigns: views by campaign with source and medium, joined to the signups by campaign. */
export async function readCampaigns(
  range: { from: string; to: string },
  now: Date,
  client?: AppSupabaseClient,
): Promise<AnalyticsResult<CampaignRow[]>> {
  const [views, signups] = await Promise.all([
    vercelRead("campaigns", range, now, async (client, key) => {
      const query = { filter: PRODUCTION, from: key.from, to: key.to };
      const [bySource, byMedium] = await Promise.all([
        client.aggregatePageviews({ ...query, by: ["utmCampaign", "utmSource"] }),
        client.aggregatePageviews({ ...query, by: ["utmCampaign", "utmMedium"] }),
      ]);
      return { bySource, byMedium };
    }),
    readSignups(range.from, range.to, client),
  ]);
  if (!views.ok) return views;
  if (!signups.ok) return signups;
  return {
    ok: true,
    data: buildCampaigns(views.data.bySource, views.data.byMedium, signups.data.campaigns),
    readAt: views.readAt,
  };
}

/**
 * Every landing page on record, with the slugs it has had in each locale — the
 * working copy's and the live copy's, which differ until the next publish.
 */
async function readLandingPageDirectory(
  service: LandingPageService,
): Promise<LandingPageEntry[]> {
  const [drafts, published] = await Promise.all([
    service.listAdminPages(),
    service.listPublishedPages(),
  ]);
  const liveSlugs = new Map(published.map((page) => [page.id, page.versions]));
  return drafts.map((page) => ({
    id: page.id,
    versions: page.versions.map(({ locale, title }) => ({ locale, title })),
    slugs: [
      ...page.versions.map(({ locale, slug }) => ({ locale, slug })),
      ...(liveSlugs.get(page.id) ?? []).map(({ locale, slug }) => ({ locale, slug })),
    ],
  }));
}

/** Views per landing page, filed under the page by every id and slug it is served at. */
export async function readLandingPages(
  range: { from: string; to: string },
  now: Date,
  client?: AppSupabaseClient,
): Promise<AnalyticsResult<LandingPageRow[]>> {
  const views = await vercelRead("landing", range, now, (client, key) =>
    client.aggregatePageviews({
      by: ["requestPath"],
      filter: `${PRODUCTION} and route eq ${odataString(LANDING_PAGE_ROUTE)}`,
      from: key.from,
      to: key.to,
    }),
  );
  if (!views.ok) return views;
  const service = new LandingPageService(await databaseClient(client));
  try {
    const pages = await readLandingPageDirectory(service);
    return { ok: true, data: buildLandingPages(views.data, pages), readAt: views.readAt };
  } catch (error) {
    console.error("admin analytics: the landing page directory read failed", error);
    return { ok: false, reason: "failed" };
  }
}
