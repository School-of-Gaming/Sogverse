import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";

import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/constants/locales";
import { createClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/types";
import {
  VercelAnalyticsClient,
  VercelAnalyticsError,
  odataString,
  vercelAnalyticsConfig,
  type PageviewsGroup,
  type VercelAnalyticsConfig,
} from "@/lib/vercel-analytics.server";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";
import {
  LANDING_PAGE_ROUTE,
  analyticsCacheKey,
  buildBreakdown,
  buildCampaigns,
  buildDayVisits,
  buildLandingPages,
  buildPathViews,
  buildRoutes,
  localePathFilter,
  type AnalyticsCacheKey,
  type AnalyticsResult,
  type BreakdownRow,
  type CampaignLabels,
  type CampaignRow,
  type LandingPageEntry,
  type LandingPageRow,
  type PathViewsRow,
  type RouteRow,
  type TrafficPath,
  type WebAnalyticsOverview,
} from "./admin-analytics.build";

/**
 * The admin analytics page's reads, all from Vercel Web Analytics.
 *
 * **Every Vercel read is server-only and cached for the hour.** The token reads
 * every page of the project, so it never leaves the server, and each read is
 * stored in Next's data cache under `analyticsCacheKey` — the read, its days and
 * the current UTC hour — so admins clicking through ranges reuse one another's
 * reads and cannot run the endpoint's 400-a-minute limit down.
 *
 * **Every read answers on its own.** Each returns an `AnalyticsResult`, and a
 * failure is logged in full here and handed to its section as a reason, never as
 * zeros — so one read failing leaves every other section standing.
 *
 * The page is behind the proxy's admin gate, and its route checks the role
 * again before calling anything here. The MCP analytics tools
 * (`src/lib/mcp/analytics.ts`) read through these same functions behind the
 * MCP gate. The landing pages read also names each page from the landing page
 * directory in the database: a tool hands in the admin's own token-bound
 * client for it, and the page leaves it out and reads on its own session.
 */

/** Views on production only, stated on every filter rather than left to the endpoint's default. */
const PRODUCTION = `environment eq ${odataString("production")}`;

const ONE_HOUR_S = 3600;

/**
 * What a failed Vercel read is reported as: a refusal — 401, 403 or 404, a
 * token or project Vercel will not serve — is `refused`, because trying again
 * in a minute will not change it.
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

/** Campaigns: views by campaign, with the sources and mediums behind each. */
export function readCampaigns(
  range: { from: string; to: string },
  now: Date,
): Promise<AnalyticsResult<CampaignRow[]>> {
  return vercelRead("campaigns", range, now, async (client, key) => {
    const query = { filter: PRODUCTION, from: key.from, to: key.to };
    const [bySource, byMedium] = await Promise.all([
      client.aggregatePageviews({ ...query, by: ["utmCampaign", "utmSource"] }),
      client.aggregatePageviews({ ...query, by: ["utmCampaign", "utmMedium"] }),
    ]);
    return buildCampaigns(bySource, byMedium);
  });
}

// ---------------------------------------------------------------------------
// Landing pages: views named from the landing page directory
// ---------------------------------------------------------------------------

/**
 * The client the directory read runs on: the one handed in (an MCP tool's,
 * bound to the admin's token), or else the page's own session.
 *
 * Awaited outside a read's `try`: building the session client reads cookies,
 * and a dynamic-render signal travels as a thrown control-flow object that
 * must not be reported as a failed read.
 */
async function databaseClient(client: AppSupabaseClient | undefined): Promise<AppSupabaseClient> {
  return client ?? (await createClient());
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
