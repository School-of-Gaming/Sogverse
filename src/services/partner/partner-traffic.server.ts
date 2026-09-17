import "server-only";

import { unstable_cache } from "next/cache";

import { PartnerQueryError } from "@/lib/api/partner-auth.server";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import {
  VercelAnalyticsClient,
  odataString,
  type PageviewsGroup,
  type VercelAnalyticsConfig,
} from "@/lib/vercel-analytics.server";
import { PATHNAMES } from "@/i18n/pathnames";
import type { PartnerTrafficQuery, PartnerTrafficResponse } from "./partner.contracts";
import { readProgrammeProductIds } from "./partner-scope.server";
import type { PartnerDb } from "./partner-shared-db.server";

/**
 * `/traffic` — pageviews of the pages a Lynx campaign lands on, from Vercel Web
 * Analytics, split three ways per page: by campaign, by source and medium, and
 * by UTC day.
 *
 * **Every split is of the same views and sums to the page's `pageviews`.** The
 * three are three separate reads, so the sums are checked rather than assumed:
 * a view arriving between the reads — the current day is live — would
 * otherwise leave one split a view ahead of the others. A page whose splits
 * disagree is read once more, and a second disagreement is thrown rather than
 * answered.
 *
 * **The whole resolved answer is cached for the hour** — see
 * `readPartnerTraffic`.
 */

type TrafficPage = PartnerTrafficResponse["pages"][number];
type TrafficPageKind = TrafficPage["page"];
type CampaignEntry = TrafficPage["by_campaign"][number];
type SourceMediumEntry = TrafficPage["by_source_medium"][number];

/** The Vercel `route` of the Roblox landing page and of the shop, every locale on one row. */
const LANDING_ROUTE = "/roblox";
const SHOP_ROUTE = "/shop";

/**
 * Views on production only. The endpoint's own default is production, but a
 * default that may or may not survive an explicit `filter` is not one to lean
 * on, so every filter says it.
 */
const PRODUCTION = `environment eq ${odataString("production")}`;

/**
 * Programme products per discovery read. A product has one path per locale
 * plus its legacy one, so ten products are sixty paths: a filter that stays
 * well inside a URL, and a response that can never reach the 100-group fold.
 */
const DISCOVERY_CHUNK = 10;

/** The documented default window: the last thirty UTC days, today included. */
const DEFAULT_RANGE_DAYS = 30;

/**
 * The first UTC day Vercel Web Analytics holds for this project: analytics was
 * switched on at the end of May 2026, as the documentation page says.
 */
export const TRAFFIC_DATA_START = "2026-05-31";

/** How far back Vercel keeps the counts on the team's plan: two years, as the page says. */
const TRAFFIC_RETENTION_YEARS = 2;

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Pure pieces
// ---------------------------------------------------------------------------

/**
 * The earliest UTC day any count reaches back to at `now`: the later of the day
 * analytics was switched on and the day the two-year retention reaches.
 */
export function earliestTrafficDay(now: Date): string {
  const retained = new Date(
    Date.UTC(
      now.getUTCFullYear() - TRAFFIC_RETENTION_YEARS,
      now.getUTCMonth(),
      now.getUTCDate(),
    ),
  )
    .toISOString()
    .slice(0, 10);
  return retained > TRAFFIC_DATA_START ? retained : TRAFFIC_DATA_START;
}

/**
 * The range the answer covers: what the caller asked for, else the thirty UTC
 * days ending on `to` — which itself defaults to today, in UTC — clamped to the
 * days a count can exist on.
 *
 * **Clamped, because `range` is the days the counts cover.** The page says the
 * counts reach back to `earliestTrafficDay` and no further, and a day after
 * today has none yet, so a range reaching past either end is answered for the
 * days it shares with them and `range` names exactly those — the truthful
 * answer, and one that bounds the Vercel reads: an unbounded `from` or `to`
 * would otherwise fan out into a read per hundred days across years.
 *
 * Refused as the caller's mistake (→ 400 naming the parameter):
 *
 * - a `from` later than the `to` a default completed — the query schema
 *   refuses a reversed pair it can see, not one a default made, and `/campaigns`
 *   refuses the same case the same way;
 * - a range that shares no day with the counts at all — wholly before the
 *   earliest day, or wholly after today — which has no truthful `range` to
 *   answer with.
 */
export function resolveTrafficRange(
  from: string | undefined,
  to: string | undefined,
  now: Date,
): { from: string; to: string } {
  const today = now.toISOString().slice(0, 10);
  const end = to ?? today;
  const start =
    from ??
    new Date(Date.parse(`${end}T00:00:00Z`) - (DEFAULT_RANGE_DAYS - 1) * DAY_MS)
      .toISOString()
      .slice(0, 10);
  if (start > end) {
    throw new PartnerQueryError(
      `from: must be on or before to, which defaults to today (${end})`,
    );
  }

  const earliest = earliestTrafficDay(now);
  if (end < earliest) {
    throw new PartnerQueryError(
      `to: must be on or after ${earliest}, the earliest day traffic is kept for`,
    );
  }
  if (start > today) {
    throw new PartnerQueryError(
      from === undefined
        ? `from: defaults to the 30 days ending on to (${start}), which lies after today (${today})`
        : `from: must be on or before today (${today})`,
    );
  }
  return {
    from: start < earliest ? earliest : start,
    to: end > today ? today : end,
  };
}

/**
 * Every path a product's shop page has been served at: its localized path in
 * each locale, prefixed with the locale, and the unprefixed `/shop/<id>` it had
 * before URLs carried a locale. Derived from the pathnames map, so a translated
 * slug added there is counted here without an edit.
 */
export function productPagePaths(productId: string): string[] {
  const templates = PATHNAMES["/shop/[id]"];
  const paths = SUPPORTED_LOCALES.map(
    (locale) => `/${locale}${templates[locale].replace("[id]", productId)}`,
  );
  return [...new Set([...paths, `/shop/${productId}`])];
}

function pathsFilter(paths: readonly string[]): string {
  return `${PRODUCTION} and requestPath in (${paths.map(odataString).join(", ")})`;
}

/** A UTM value as the API reports it: Vercel's empty string for "none" is `null`. */
function utmValue(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A split's entries: most views first, ties by value, and the entry with no
 * UTM value at all last, as the documentation's example lays it out. A group
 * with no views is not an entry.
 */
function sortSplit<T extends { pageviews: number }>(
  entries: T[],
  label: (entry: T) => (string | null)[],
): T[] {
  const isUntagged = (entry: T) => label(entry).every((value) => value === null);
  return entries
    .filter((entry) => entry.pageviews > 0)
    .sort((a, b) => {
      if (isUntagged(a) !== isUntagged(b)) return isUntagged(a) ? 1 : -1;
      if (a.pageviews !== b.pageviews) return b.pageviews - a.pageviews;
      return compareText(JSON.stringify(label(a)), JSON.stringify(label(b)));
    });
}

/** Sum groups whose normalized label is equal: `""` and absent both become `null`. */
function collapse<T extends { pageviews: number }>(
  groups: readonly PageviewsGroup[],
  entry: (group: PageviewsGroup) => T,
  label: (entry: T) => (string | null)[],
): T[] {
  const byLabel = new Map<string, T>();
  for (const group of groups) {
    const next = entry(group);
    const key = JSON.stringify(label(next));
    const existing = byLabel.get(key);
    if (existing) existing.pageviews += next.pageviews;
    else byLabel.set(key, next);
  }
  return [...byLabel.values()];
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const sum = (entries: readonly { pageviews: number }[]) =>
  entries.reduce((total, entry) => total + entry.pageviews, 0);

/**
 * Build one page's entry from its three reads, or `null` when the splits do not
 * sum to the same number. A day outside the range with views throws: the read
 * asked for none, and dropping it would break the sum silently.
 */
export function buildTrafficPage(
  page: TrafficPageKind,
  productId: string | null,
  range: { from: string; to: string },
  reads: {
    byCampaign: readonly PageviewsGroup[];
    bySourceMedium: readonly PageviewsGroup[];
    byDay: readonly PageviewsGroup[];
  },
): TrafficPage | null {
  const campaignLabel = (entry: CampaignEntry) => [entry.utm_campaign];
  const sourceMediumLabel = (entry: SourceMediumEntry) => [entry.utm_source, entry.utm_medium];

  const by_campaign = sortSplit<CampaignEntry>(
    collapse<CampaignEntry>(
      reads.byCampaign,
      (group) => ({ utm_campaign: utmValue(group.values.utmCampaign), pageviews: group.pageviews }),
      campaignLabel,
    ),
    campaignLabel,
  );
  const by_source_medium = sortSplit<SourceMediumEntry>(
    collapse<SourceMediumEntry>(
      reads.bySourceMedium,
      (group) => ({
        utm_source: utmValue(group.values.utmSource),
        utm_medium: utmValue(group.values.utmMedium),
        pageviews: group.pageviews,
      }),
      sourceMediumLabel,
    ),
    sourceMediumLabel,
  );

  const by_day = reads.byDay
    .filter((group) => group.pageviews > 0)
    .map((group) => {
      const date = group.values.day;
      if (date === undefined || date < range.from || date > range.to) {
        throw new Error(
          `partner traffic: a ${page} day bucket ${String(date)} lies outside ${range.from}..${range.to}`,
        );
      }
      return { date, pageviews: group.pageviews };
    })
    .sort((a, b) => compareText(a.date, b.date));

  const pageviews = sum(by_campaign);
  if (sum(by_source_medium) !== pageviews || sum(by_day) !== pageviews) return null;

  return { page, product_id: productId, pageviews, by_campaign, by_source_medium, by_day };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The normalized query an answer is computed from, and cached under. */
export interface TrafficCacheKey {
  /** `product` whenever a product was named — the filter implies it. */
  page: TrafficPageKind | null;
  product_id: string | null;
  from: string;
  to: string;
  /** The UTC hour the answer belongs to, `YYYY-MM-DDTHH`. */
  hour: string;
}

async function readPage(
  client: VercelAnalyticsClient,
  page: TrafficPageKind,
  productId: string | null,
  filter: string,
  range: { from: string; to: string },
): Promise<TrafficPage> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const [byCampaign, bySourceMedium, byDay] = await Promise.all([
      client.aggregatePageviews({ by: ["utmCampaign"], filter, ...range }),
      client.aggregatePageviews({ by: ["utmSource", "utmMedium"], filter, ...range }),
      client.aggregatePageviews({ by: ["day"], filter, ...range }),
    ]);
    const built = buildTrafficPage(page, productId, range, {
      byCampaign,
      bySourceMedium,
      byDay,
    });
    if (built !== null) return built;
  }
  throw new Error(
    `partner traffic: the ${page}${productId ? ` ${productId}` : ""} splits disagreed on the total twice in a row`,
  );
}

/**
 * The Programme products whose page had at least one view in the range,
 * ascending by id. One `requestPath` read per chunk of products narrows the
 * split reads to the pages that have something to split.
 */
async function readViewedProducts(
  client: VercelAnalyticsClient,
  productIds: readonly string[],
  range: { from: string; to: string },
): Promise<string[]> {
  const viewed = new Set<string>();
  await Promise.all(
    chunks(productIds, DISCOVERY_CHUNK).map(async (chunk) => {
      const productByPath = new Map<string, string>();
      for (const id of chunk) {
        for (const path of productPagePaths(id)) productByPath.set(path, id);
      }
      const groups = await client.aggregatePageviews({
        by: ["requestPath"],
        filter: pathsFilter([...productByPath.keys()]),
        ...range,
      });
      for (const group of groups) {
        const id = productByPath.get(group.values.requestPath ?? "");
        if (id !== undefined && group.pageviews > 0) viewed.add(id);
      }
    }),
  );
  return [...viewed].sort(compareText);
}

/** Compute the answer for a normalized query, uncached. */
export async function computePartnerTraffic(
  db: PartnerDb,
  client: VercelAnalyticsClient,
  key: TrafficCacheKey,
): Promise<PartnerTrafficResponse> {
  const range = { from: key.from, to: key.to };
  const wants = (page: TrafficPageKind) => key.page === null || key.page === page;

  const landingFilter = `${PRODUCTION} and route eq ${odataString(LANDING_ROUTE)}`;
  const shopFilter = `${PRODUCTION} and route eq ${odataString(SHOP_ROUTE)}`;

  const readProducts = async (): Promise<TrafficPage[]> => {
    const programme = await readProgrammeProductIds(db);
    // An unknown or non-Programme product matches nothing.
    const candidates =
      key.product_id === null ? programme : programme.filter((id) => id === key.product_id);
    const viewed = await readViewedProducts(client, candidates, range);
    return Promise.all(
      viewed.map((id) =>
        readPage(client, "product", id, pathsFilter(productPagePaths(id)), range),
      ),
    );
  };

  const [landing, shop, products] = await Promise.all([
    wants("landing") ? readPage(client, "landing", null, landingFilter, range) : null,
    wants("shop") ? readPage(client, "shop", null, shopFilter, range) : null,
    wants("product") ? readProducts() : [],
  ]);

  const pages: TrafficPage[] = [];
  if (landing) pages.push(landing);
  if (shop) pages.push(shop);
  pages.push(...products);
  return { range, pages };
}

/**
 * The traffic answer for a parsed query, cached across instances for the hour
 * through Next's data cache.
 *
 * **The key is the normalized query, never the raw one**: the resolved range
 * (so a defaulted window and the same window named explicitly share an entry),
 * `page=product` implied by a `product_id`, and the current UTC hour. The hour
 * is in the key because the cache serves a stale entry once before refreshing
 * it: on a key that outlived its hour, the first caller after a quiet day would
 * be handed that day's counts. Keyed by the hour, no entry is ever served
 * outside the hour it was computed in, which is what "up to an hour old" means.
 *
 * Nothing secret is in the key; the client and its token are closed over.
 */
export async function readPartnerTraffic(
  db: PartnerDb,
  config: VercelAnalyticsConfig,
  query: PartnerTrafficQuery,
  now: Date,
): Promise<PartnerTrafficResponse> {
  const range = resolveTrafficRange(query.from, query.to, now);
  const key: TrafficCacheKey = {
    page: query.product_id !== undefined ? "product" : (query.page ?? null),
    product_id: query.product_id ?? null,
    from: range.from,
    to: range.to,
    hour: now.toISOString().slice(0, 13),
  };
  const cached = unstable_cache(
    (normalized: TrafficCacheKey) =>
      computePartnerTraffic(db, new VercelAnalyticsClient(config), normalized),
    ["partner-api", "traffic"],
    { revalidate: 3600 },
  );
  return cached(key);
}
