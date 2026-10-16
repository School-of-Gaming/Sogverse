import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import { z } from "zod-v4";
import { PATHNAMES } from "@/i18n/pathnames";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { readMcpCaller } from "@/lib/mcp/auth";
import { READ_ONLY, answer, refusal } from "@/lib/mcp/library-call";
import { createBearerClient } from "@/lib/supabase/bearer";
import {
  MAX_FILTER_LENGTH,
  REQUEST_LOG_DAYS,
  TRAFFIC_DATA_START,
  TRAFFIC_RETENTION_YEARS,
  earliestTrafficDay,
} from "@/lib/vercel-analytics.server";
import {
  DEFAULT_ANALYTICS_PRESET,
  LANDING_PAGE_ROUTE,
  buildTimeline,
  daysOf,
  isCalendarDay,
  resolveRequestedRange,
  signupsMatching,
  trafficPath,
  type AnalyticsResult,
  type CampaignLabels,
  type TrafficPath,
} from "@/services/admin-analytics/admin-analytics.build";
import {
  readBreakdowns,
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
import type { AppSupabaseClient } from "@/types";

/*
 * The analytics tools: the site's traffic and the families it brings in, read
 * by an AI app acting as an admin. They run the admin Analytics page's own
 * reads (`src/services/admin-analytics/`), so a figure here is the figure the
 * page shows for the same days, cached under the same key; only the database
 * reads take the admin's token-bound client in place of the page's session.
 *
 * Read-only and general over the site: a page is asked about by its path, so
 * a landing page, a shop page and the home page are asked about alike, and the
 * landing page tools are where an AI app finds a landing page's addresses.
 */

// ---------------------------------------------------------------------------
// The manual — what each description tells the AI app
// ---------------------------------------------------------------------------

/** Each language's landing page address, `/fi/tutustu/<slug>`, from the pathnames map. */
const LANDING_ADDRESSES = SUPPORTED_LOCALES.map(
  (locale) => `/${locale}${PATHNAMES[LANDING_PAGE_ROUTE][locale].replace("[idOrSlug]", "<slug or id>")}`,
).join(", ");

/** The limits every figure is read under, built from the constants that set them. */
export const ANALYTICS_CAVEATS = [
  "Pageviews and visitors (Vercel Web Analytics) count only visitors who accepted analytics cookies, so real traffic is higher; among visitors arriving from ads roughly one in ten has been measured accepting. Always say so when quoting them.",
  "Visitors are distinct device ids over the range or group asked for, approximate, and never add up across days or groups.",
  `Pages served counts every visitor whatever they answered on the cookie banner, from Vercel's edge request log: full page loads only (moving between pages inside the site is not counted), bots left out except the Facebook and Instagram in-app browsers, the last ${REQUEST_LOG_DAYS} days only, and the whole site only, never a page or a campaign. It needs a Vercel token with observability access and reports "refused" (the Analytics page shows "Vercel refused") until one is configured.`,
  "Signups are parent accounts created, from Sogverse's own database, and complete. Their campaign labels are stored only for parents whose consent granted marketing, so a split by campaign covers those families only, and no signup records which page it came from, so signups cannot be narrowed to a page.",
  `Every day is a UTC day. Web Analytics reaches back to ${TRAFFIC_DATA_START}, when it was switched on, and is kept for ${TRAFFIC_RETENTION_YEARS} years; a range reaching outside that is narrowed and the answer says so.`,
  "Vercel figures are cached for the hour they were read in; readAt says when.",
  "Button clicks are not recorded anywhere these tools read, so no question about clicks can be answered here.",
];

const CAVEATS_TEXT = ANALYTICS_CAVEATS.map((line) => `- ${line}`).join("\n");

const RANGE_TEXT = `The range is either from and to (UTC days, YYYY-MM-DD, both inclusive) or lastDays (the last N UTC days, today included); with neither it is the last ${DEFAULT_ANALYTICS_PRESET} days.`;

const PATHS_TEXT = [
  "A path with a language prefix (/fi/kauppa) counts that address only. A path without one (/shop, or a translated /kauppa) counts the page in every language: it is translated into each language's own address (/en/shop, /fi/kauppa, /sv/butik, …) and the answer lists the addresses it counted. A full URL is read as its path; the query string is ignored.",
  `Landing pages live at /<language>/<that language's landing segment>/<slug> and the same with the page's id in place of the slug: ${LANDING_ADDRESSES}. A slug belongs to its own language only, so to ask about a landing page pass each language's address (get_landing_page lists them), and add ${PATHNAMES[LANDING_PAGE_ROUTE].en.replace("[idOrSlug]", "<id>")} without a prefix to count its id address in every language. get_analytics_breakdown by landing_pages files every landing page's views under it by every id and slug it has been served at, slugs since changed included.`,
].join(" ");

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const day = z
  .string()
  .refine(isCalendarDay, "Expected a UTC day as YYYY-MM-DD.");

const rangeInput = {
  from: day.optional().describe("The first UTC day, YYYY-MM-DD. Give it with to."),
  to: day.optional().describe("The last UTC day, YYYY-MM-DD, inclusive. Give it with from."),
  lastDays: z
    .number()
    .int()
    .min(1)
    .max(TRAFFIC_RETENTION_YEARS * 366)
    .optional()
    .describe("The last N UTC days, today included, in place of from and to."),
};

const label = (what: string) =>
  z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(`Only visits and signups whose ${what} is exactly this, letter case included.`);

/** The range asked for, or a refusal naming what is wrong with it. */
function requestedRange(input: {
  from?: string;
  to?: string;
  lastDays?: number;
}): { from: string; to: string } | { lastDays: number } | string {
  const ends = [input.from, input.to].filter((end) => end !== undefined).length;
  if (input.lastDays !== undefined && ends > 0) {
    return "Give either from and to, or lastDays, not both.";
  }
  if (ends === 1) return "Give from and to together.";
  if (input.from !== undefined && input.to !== undefined) return { from: input.from, to: input.to };
  return { lastDays: input.lastDays ?? DEFAULT_ANALYTICS_PRESET };
}

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

type Unavailable = {
  available: false;
  reason: "unconfigured" | "refused" | "failed" | "not_split";
  explanation: string;
};

const UNCONFIGURED =
  "Vercel analytics is not configured on this server (its token, team or project is unset); the owner has to set it.";

function unavailableWebAnalytics(reason: "unconfigured" | "refused" | "failed"): Unavailable {
  const explanation = {
    unconfigured: UNCONFIGURED,
    refused:
      'Vercel refused the analytics token for Web Analytics (the Analytics page shows "Vercel refused"). That lasts until the owner fixes the token; asking again will not help.',
    failed: "Vercel did not answer the Web Analytics read. It may pass if asked again in a minute.",
  }[reason];
  return { available: false, reason, explanation };
}

function unavailableServed(reason: "unconfigured" | "refused" | "failed"): Unavailable {
  const explanation = {
    unconfigured: UNCONFIGURED,
    refused:
      'Vercel refused: pages served needs a Vercel token with observability access, and the configured token has none (the Analytics page shows "Vercel refused"). It stays unavailable until such a token is configured; asking again will not help.',
    failed: "Vercel's request log did not answer. It may pass if asked again in a minute.",
  }[reason];
  return { available: false, reason, explanation };
}

function unavailableSignups(): Unavailable {
  return {
    available: false,
    reason: "failed",
    explanation: "Sogverse's own database did not answer the signups read. It may pass if asked again.",
  };
}

const SERVED_NOT_SPLIT: Unavailable = {
  available: false,
  reason: "not_split",
  explanation:
    "Pages served is counted for the whole site only; it cannot be narrowed to a page or a campaign. Ask without paths and campaign labels for it.",
};

const SIGNUPS_NOT_BY_PAGE: Unavailable = {
  available: false,
  reason: "not_split",
  explanation:
    "Sogverse does not record which page a family signed up from, so signups cannot be narrowed to a page. Ask by campaign label instead, or without paths for the site's signups.",
};

/**
 * A breakdown's read failing, as a tool error carrying why. A table that joins
 * the database fails as one whole, so its passing failure names both sources.
 */
function breakdownFailure(
  reason: "unconfigured" | "refused" | "failed",
  database: boolean,
): CallToolResult {
  if (database && reason === "failed") {
    return refusal(
      "Vercel or Sogverse's own database did not answer this read. It may pass if asked again in a minute.",
    );
  }
  return refusal(unavailableWebAnalytics(reason).explanation);
}

// ---------------------------------------------------------------------------
// Running a tool
// ---------------------------------------------------------------------------

/** Run a tool body as the admin the gate let through, on their own token. */
async function asAnalyticsAdmin(
  ctx: ServerContext,
  run: (client: AppSupabaseClient) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  const authInfo = ctx.http?.authInfo;
  if (!authInfo || !readMcpCaller(authInfo)) {
    // Unreachable behind the gate; said rather than assumed.
    return refusal("No verified caller on this request.");
  }
  try {
    return await run(createBearerClient(authInfo.token));
  } catch (error) {
    console.error("[mcp] analytics tool failed:", error);
    return refusal("Sogverse could not read the analytics. Asking again may work.");
  }
}

/** The range part of every answer. */
function rangeAnswer(range: { from: string; to: string; adjusted: string | null }) {
  return {
    from: range.from,
    to: range.to,
    days: daysOf(range.from, range.to).length,
    timeZone: "UTC",
    adjusted: range.adjusted,
  };
}

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

/** The most paths one summary asks about. */
const MAX_PATHS = 20;

const BREAKDOWNS = ["pages", "landing_pages", "campaigns", "referrers", "countries", "devices"] as const;

export function registerAnalyticsTools(server: McpServer): void {
  server.registerTool(
    "get_analytics_summary",
    {
      title: "Analytics summary",
      description: [
        "The site's traffic and signups over a range of UTC days, as the admin Analytics page counts them: pageviews and visitors from Vercel Web Analytics, pages served from Vercel's request log, and parent signups from Sogverse's own database. Narrow it to some pages (paths) or to campaign labels (campaign, source, medium; they combine with AND, and several paths with OR).",
        "Each measure answers on its own: one Vercel cannot read is marked unavailable with the reason and an explanation to relay, while the others stand. A zero is a real zero.",
        RANGE_TEXT,
        PATHS_TEXT,
        "With paths the answer also gives each path's pageviews address by address; two paths sharing an address both count it, so those rows can add up to more than the total. includeDays adds one row per UTC day.",
        `What every figure means, to relay with it:\n${CAVEATS_TEXT}`,
      ].join("\n\n"),
      inputSchema: z.object({
        ...rangeInput,
        paths: z
          .array(z.string().min(1).max(500))
          .min(1)
          .max(MAX_PATHS)
          .optional()
          .describe("Page paths or full addresses to narrow to, matched as described."),
        campaign: label("utm_campaign"),
        source: label("utm_source"),
        medium: label("utm_medium"),
        includeDays: z.boolean().optional().describe("Add one row per UTC day."),
      }),
      annotations: READ_ONLY,
    },
    (input, ctx) =>
      asAnalyticsAdmin(ctx, async (client) => {
        const requested = requestedRange(input);
        if (typeof requested === "string") return refusal(requested);
        const now = new Date();
        const range = resolveRequestedRange(requested, now, earliestTrafficDay(now));
        if (!range.ok) return refusal(range.reason);
        const days = { from: range.from, to: range.to };

        const paths: TrafficPath[] = [];
        for (const given of input.paths ?? []) {
          const path = trafficPath(given);
          if (path === null) {
            return refusal(`"${given}" is not a path: give one starting with / or a full https address.`);
          }
          paths.push(path);
        }
        const labels: CampaignLabels = {
          ...(input.campaign === undefined ? {} : { campaign: input.campaign }),
          ...(input.source === undefined ? {} : { source: input.source }),
          ...(input.medium === undefined ? {} : { medium: input.medium }),
        };
        const byLabel = Object.keys(labels).length > 0;
        const byPath = paths.length > 0;
        const filter: TrafficFilter = { paths, ...labels };
        if (trafficFilterExpression(filter).length > MAX_FILTER_LENGTH) {
          return refusal(
            "That is more addresses than Vercel takes in one question. Ask about fewer paths at once, or give them with a language prefix so each counts one address.",
          );
        }

        const [overview, served, signups, pathViews] = await Promise.all([
          readWebAnalyticsOverview(days, now, byPath || byLabel ? filter : undefined),
          byPath || byLabel ? null : readServedPageLoads(days, now),
          byPath ? null : readSignups(days.from, days.to, client),
          byPath ? readPathViews(days, now, filter) : null,
        ]);

        return answer({
          range: rangeAnswer(range),
          filters: {
            paths: paths.map((path) => ({
              given: path.given,
              matching: path.locale === null ? "every language" : "this address only",
              addresses: path.addresses,
            })),
            campaign: labels.campaign ?? null,
            source: labels.source ?? null,
            medium: labels.medium ?? null,
          },
          webAnalytics: overview.ok
            ? {
                available: true,
                pageviews: overview.data.pageviews,
                visitors: overview.data.visitors,
                readAt: overview.readAt,
              }
            : unavailableWebAnalytics(overview.reason),
          pagesServed:
            served === null
              ? SERVED_NOT_SPLIT
              : served.ok
                ? {
                    available: true,
                    pagesServed: served.data.total,
                    window: served.data.window,
                    note:
                      served.data.window === null
                        ? `The range lies wholly before the last ${REQUEST_LOG_DAYS} days the request log keeps, so nothing was counted.`
                        : served.data.window.from === range.from
                          ? null
                          : `Counted from ${served.data.window.from} only: the request log keeps the last ${REQUEST_LOG_DAYS} days.`,
                    readAt: served.readAt,
                  }
                : unavailableServed(served.reason),
          signups:
            signups === null
              ? SIGNUPS_NOT_BY_PAGE
              : signups.ok
                ? {
                    available: true,
                    signups: byLabel
                      ? signupsMatching(signups.data.campaigns, labels)
                      : signups.data.total,
                    note: byLabel
                      ? "Counted only among parents whose consent granted marketing, the only ones whose campaign labels are stored."
                      : null,
                    readAt: signups.readAt,
                  }
                : unavailableSignups(),
          ...(pathViews === null
            ? {}
            : {
                byPath: pathViews.ok ? pathViews.data : unavailableWebAnalytics(pathViews.reason),
              }),
          ...(input.includeDays
            ? {
                days: buildTimeline(days, {
                  visits: overview.ok ? overview.data.days : null,
                  served: served?.ok ? served.data : null,
                  // Days are not split by campaign, so a narrowed question has none.
                  signups: signups?.ok && !byLabel ? signups.data.days : null,
                }).map((row) => ({
                  day: row.day,
                  pageviews: row.pageviews,
                  visitors: row.visitors,
                  pagesServed: row.served,
                  signups: row.signups,
                })),
              }
            : {}),
        });
      }),
  );

  server.registerTool(
    "get_analytics_breakdown",
    {
      title: "Analytics breakdown",
      description: [
        "One table of the admin Analytics page over a range of UTC days, most first: by pages (one row per page across every language, with its language split), landing_pages (each landing page's views under its id and titles, by every id and slug it has been served at; a path no landing page answers to keeps its own row), campaigns (Web Analytics pageviews beside parent signups per utm_campaign, with the sources and mediums behind each; null is no campaign), referrers (by referring site), countries or devices.",
        "Every table counts Web Analytics pageviews; campaigns adds signups. A table Vercel cannot read is a tool error saying why.",
        RANGE_TEXT,
        `Pages are named by route (the address with its language left out, the slug untranslated; landing pages are ${LANDING_PAGE_ROUTE}), so a page's row covers every language. Landing pages are listed by the id list_landing_pages and get_landing_page use.`,
        `What every figure means, to relay with it:\n${CAVEATS_TEXT}`,
      ].join("\n\n"),
      inputSchema: z.object({
        by: z.enum(BREAKDOWNS).describe("Which table."),
        ...rangeInput,
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("The most rows to return, 25 when left out; totalRows says how many there are."),
      }),
      annotations: READ_ONLY,
    },
    (input, ctx) =>
      asAnalyticsAdmin(ctx, async (client) => {
        const requested = requestedRange(input);
        if (typeof requested === "string") return refusal(requested);
        const now = new Date();
        const range = resolveRequestedRange(requested, now, earliestTrafficDay(now));
        if (!range.ok) return refusal(range.reason);
        const days = { from: range.from, to: range.to };

        const read = await readBreakdown(input.by, days, now, client);
        if (!read.result.ok) return breakdownFailure(read.result.reason, read.database);
        const rows = read.result.data;
        const limit = input.limit ?? 25;
        return answer({
          range: rangeAnswer(range),
          by: input.by,
          rows: rows.slice(0, limit),
          totalRows: rows.length,
          truncated: rows.length > limit,
          readAt: read.result.readAt,
        });
      }),
  );
}

/** One breakdown's rows, as the tool hands them on; `database` when the read touched it. */
async function readBreakdown(
  by: (typeof BREAKDOWNS)[number],
  range: { from: string; to: string },
  now: Date,
  client: AppSupabaseClient,
): Promise<{ result: AnalyticsResult<Record<string, unknown>[]>; database: boolean }> {
  const rowsOf = <T, R extends Record<string, unknown>>(
    result: AnalyticsResult<T[]>,
    shape: (row: T) => R,
  ): AnalyticsResult<R[]> => (result.ok ? { ...result, data: result.data.map(shape) } : result);

  switch (by) {
    case "pages":
      return { result: rowsOf(await readTopPages(range, now), (row) => ({ ...row })), database: false };
    case "campaigns":
      return {
        result: rowsOf(await readCampaigns(range, now, client), (row) => ({ ...row })),
        database: true,
      };
    case "landing_pages":
      return {
        result: rowsOf(await readLandingPages(range, now, client), (row) => ({
          landingPageId: row.page?.id ?? null,
          titles: row.page?.versions ?? [],
          path: row.path,
          pageviews: row.pageviews,
          languages: row.languages,
        })),
        database: true,
      };
    case "referrers":
    case "countries":
    case "devices": {
      const result = await readBreakdowns(range, now);
      return {
        result: result.ok
          ? { ...result, data: result.data[by].map((row) => ({ ...row })) }
          : result,
        database: false,
      };
    }
  }
}
