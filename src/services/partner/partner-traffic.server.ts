import "server-only";

import { unstable_cache } from "next/cache";

import { PartnerQueryError } from "@/lib/api/partner-auth.server";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import {
  MAX_FILTER_LENGTH,
  VercelAnalyticsClient,
  earliestTrafficDay,
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
 * Analytics, split five ways per page: by campaign, by source and medium, by
 * content, by term, and by UTC day.
 *
 * **Every split is of the same views and sums to the page's `pageviews`.** The
 * five are five separate reads, so the sums are checked rather than assumed:
 * a view arriving between the reads — the current day is live — would
 * otherwise leave one split a view ahead of the others. A page whose splits
 * disagree is read once more, and a second disagreement is thrown rather than
 * answered.
 *
 * **That throw is a known, accepted risk (owner decision, 2026-10-13).** A
 * range including today can 500 when views land between the reads twice
 * running, and each split added widens the gap between the first read and the
 * last. It is rare at our traffic and Lynx can retry, so it was left as is
 * until it happens. The fix then is to let the caller ask for one split per
 * request (an optional `split` parameter, all five when absent, so no existing
 * caller changes): one read grouped by day and that split — Vercel takes two
 * groupings — puts every number in the answer on the same moment, and the
 * mismatch can no longer occur.
 *
 * **The whole resolved answer is cached for the hour** — see
 * `readPartnerTraffic`.
 */

type TrafficPage = PartnerTrafficResponse["pages"][number];
type TrafficPageKind = TrafficPage["page"];
type CampaignEntry = TrafficPage["by_campaign"][number];
type SourceMediumEntry = TrafficPage["by_source_medium"][number];
type ContentEntry = TrafficPage["by_content"][number];
type TermEntry = TrafficPage["by_term"][number];

/**
 * The Vercel `route` of the Roblox landing page and of the shop, every locale
 * on one row. The landing page is one page at three addresses, one per format,
 * and Lynx is told about it as one page.
 */
const LANDING_ROUTES = ["/roblox", "/roblox-online", "/roblox-all"];
const SHOP_ROUTE = "/shop";

/**
 * Views on production only. The endpoint's own default is production, but a
 * default that may or may not survive an explicit `filter` is not one to lean
 * on, so every filter says it.
 */
const PRODUCTION = `environment eq ${odataString("production")}`;

/** The documented default window: the last thirty UTC days, today included. */
const DEFAULT_RANGE_DAYS = 30;

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Pure pieces
// ---------------------------------------------------------------------------

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

/**
 * The Programme products in batches whose discovery filter fits Vercel's limit
 * on its length. A product has one path per locale plus its legacy one, about
 * three hundred characters of filter, so a batch is a handful of products —
 * sized by the filter it builds rather than by a count, because a count that
 * fits today stops fitting when a locale or a longer slug is added. A batch
 * names at most a few dozen paths, so its response can never reach the
 * 100-group fold.
 */
export function discoveryBatches(productIds: readonly string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  for (const id of productIds) {
    const widened = [...batch, id];
    if (batch.length > 0 && pathsFilter(widened.flatMap(productPagePaths)).length > MAX_FILTER_LENGTH) {
      batches.push(batch);
      batch = [id];
    } else {
      batch = widened;
    }
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

const sum = (entries: readonly { pageviews: number }[]) =>
  entries.reduce((total, entry) => total + entry.pageviews, 0);

/**
 * Build one page's entry from its five reads, or `null` when the splits do not
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
    byContent: readonly PageviewsGroup[];
    byTerm: readonly PageviewsGroup[];
    byDay: readonly PageviewsGroup[];
  },
): TrafficPage | null {
  const campaignLabel = (entry: CampaignEntry) => [entry.utm_campaign];
  const sourceMediumLabel = (entry: SourceMediumEntry) => [entry.utm_source, entry.utm_medium];
  const contentLabel = (entry: ContentEntry) => [entry.utm_content];
  const termLabel = (entry: TermEntry) => [entry.utm_term];

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
  const by_content = sortSplit<ContentEntry>(
    collapse<ContentEntry>(
      reads.byContent,
      (group) => ({ utm_content: utmValue(group.values.utmContent), pageviews: group.pageviews }),
      contentLabel,
    ),
    contentLabel,
  );
  const by_term = sortSplit<TermEntry>(
    collapse<TermEntry>(
      reads.byTerm,
      (group) => ({ utm_term: utmValue(group.values.utmTerm), pageviews: group.pageviews }),
      termLabel,
    ),
    termLabel,
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
  if (
    [by_source_medium, by_content, by_term, by_day].some((split) => sum(split) !== pageviews)
  ) {
    return null;
  }

  return {
    page,
    product_id: productId,
    pageviews,
    by_campaign,
    by_source_medium,
    by_content,
    by_term,
    by_day,
  };
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
    const [byCampaign, bySourceMedium, byContent, byTerm, byDay] = await Promise.all([
      client.aggregatePageviews({ by: ["utmCampaign"], filter, ...range }),
      client.aggregatePageviews({ by: ["utmSource", "utmMedium"], filter, ...range }),
      client.aggregatePageviews({ by: ["utmContent"], filter, ...range }),
      client.aggregatePageviews({ by: ["utmTerm"], filter, ...range }),
      client.aggregatePageviews({ by: ["day"], filter, ...range }),
    ]);
    const built = buildTrafficPage(page, productId, range, {
      byCampaign,
      bySourceMedium,
      byContent,
      byTerm,
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
 * ascending by id. One `requestPath` read per batch of products narrows the
 * split reads to the pages that have something to split.
 */
async function readViewedProducts(
  client: VercelAnalyticsClient,
  productIds: readonly string[],
  range: { from: string; to: string },
): Promise<string[]> {
  const viewed = new Set<string>();
  await Promise.all(
    discoveryBatches(productIds).map(async (batch) => {
      const productByPath = new Map<string, string>();
      for (const id of batch) {
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

  const landingFilter = `${PRODUCTION} and route in (${LANDING_ROUTES.map(odataString).join(", ")})`;
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
