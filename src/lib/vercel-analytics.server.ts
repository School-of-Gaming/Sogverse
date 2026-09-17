import "server-only";

import { z } from "zod";

/**
 * A reader for Vercel Web Analytics pageview counts, through the one documented
 * REST endpoint for them: `GET /v1/query/web-analytics/visits/aggregate`
 * (`docs/runbooks/vercel-analytics.md` records its verified parameters and
 * quirks). Server-only, because the token reads every page of the project.
 *
 * **Its one promise is a complete count.** The endpoint answers at most 100
 * groups and folds the rest into a literal `"Others"` row rather than dropping
 * them, so a read that trusted a single response would pass a top-100 off as
 * the whole distribution. `aggregatePageviews` therefore:
 *
 * - splits a day-grouped read into windows of at most 62 days up front — the
 *   endpoint refuses a day grouping over more than that, and it keeps every
 *   response well under the fold cap;
 * - on a folded response in any other grouping, halves the range and asks
 *   again, summing the halves — pageviews add across disjoint ranges, which is
 *   why the reader returns pageviews and never visitors;
 * - throws when a single day still folds, rather than returning a count that is
 *   silently short.
 *
 * **A response has folded only when it is full and carries an `"Others"` row.**
 * `"Others"` is also a value anybody can put in a link
 * (`?utm_campaign=Others`), and a small response carrying it is that visitor's
 * campaign, counted like any other — were the label alone the signal, one such
 * link would make every read covering its day throw. A fold happens only past
 * the cap, so a response under `MAX_GROUPS` rows cannot have folded whatever it
 * holds. A full one with a genuine `"Others"` is indistinguishable from a fold
 * and is halved as one, which costs calls and never a miscount.
 *
 * Calls go through a small fixed concurrency (the endpoint allows 400 calls a
 * minute and takes 0.4–1 s each), each with a timeout, and any refusal throws
 * with Vercel's own message for the log.
 */

const ENDPOINT = "https://api.vercel.com/v1/query/web-analytics/visits/aggregate";

/** Ten seconds per call, then give up: a hung call would hold the partner's request open. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Calls in flight at once. Three at the endpoint's fastest (0.4 s) is 450 a
 * minute — just over the 400 limit at a pace no real read sustains — and at its
 * typical pace well under it.
 */
const CONCURRENCY = 3;

/**
 * The most groups one response carries before folding the rest into
 * `"Others"`. Observed against the live endpoint, the fold row comes on top of
 * the limit (a limit of 10 answers ten groups and an eleventh "Others"); a
 * response of at least this many rows counts as full, which holds either way.
 */
const MAX_GROUPS = 100;

/**
 * The most days one day-grouped call may span. Not in the endpoint's
 * documentation: past it the call is refused with `invalid_group_by` ("Can only
 * query up to 62 days of data").
 */
const MAX_DAYS_PER_DAY_READ = 62;

/** The label the endpoint gives the groups it folded. */
const FOLDED_GROUP = "Others";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface VercelAnalyticsConfig {
  token: string;
  teamId: string;
  projectId: string;
}

/**
 * The configuration, read at call time so a deployment's environment decides.
 * `missing` names the unset variables — names only, for a log line.
 */
export function vercelAnalyticsConfig():
  | { ok: true; config: VercelAnalyticsConfig }
  | { ok: false; missing: string[] } {
  const token = process.env.VERCEL_ANALYTICS_TOKEN;
  const teamId = process.env.VERCEL_ANALYTICS_TEAM_ID;
  const projectId = process.env.VERCEL_ANALYTICS_PROJECT_ID;
  if (!token || !teamId || !projectId) {
    const variables: [name: string, value: string | undefined][] = [
      ["VERCEL_ANALYTICS_TOKEN", token],
      ["VERCEL_ANALYTICS_TEAM_ID", teamId],
      ["VERCEL_ANALYTICS_PROJECT_ID", projectId],
    ];
    return {
      ok: false,
      missing: variables.filter(([, value]) => !value).map(([name]) => name),
    };
  }
  return { ok: true, config: { token, teamId, projectId } };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** The grouping dimensions this reader supports. `day` is a time granularity. */
export type VisitsDimension =
  | "day"
  | "route"
  | "requestPath"
  | "utmCampaign"
  | "utmSource"
  | "utmMedium";

export interface PageviewsQuery {
  /** One or two dimensions; the endpoint refuses a third. */
  by: readonly [VisitsDimension] | readonly [VisitsDimension, VisitsDimension];
  /** An OData filter; build string literals with `odataString`. */
  filter: string;
  /** First and last UTC day counted, `YYYY-MM-DD`, inclusive. */
  from: string;
  to: string;
}

/**
 * One group: its value per requested dimension, and its pageviews. `day` is the
 * UTC day, `YYYY-MM-DD`. Every other value is exactly as Vercel stores it —
 * including the empty string it reports for an absent UTM parameter.
 */
export interface PageviewsGroup {
  values: Partial<Record<VisitsDimension, string>>;
  pageviews: number;
}

/** An OData string literal: single quotes, an embedded quote doubled. */
export function odataString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export class VercelAnalyticsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "VercelAnalyticsError";
  }
}

const dimensionValue = z.string().nullable();
const aggregateResponse = z.object({
  data: z.array(
    z
      .object({ pageviews: z.number().int().nonnegative(), timestamp: z.string().optional() })
      .catchall(z.unknown()),
  ),
});

function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((dayMs(to) - dayMs(from)) / DAY_MS) + 1;
}

function groupKey(values: PageviewsGroup["values"]): string {
  return JSON.stringify(Object.entries(values).sort(([a], [b]) => (a < b ? -1 : 1)));
}

/** Add `groups` into `into`, merging equal dimension values. */
function mergeInto(into: Map<string, PageviewsGroup>, groups: readonly PageviewsGroup[]) {
  for (const group of groups) {
    const key = groupKey(group.values);
    const existing = into.get(key);
    if (existing) existing.pageviews += group.pageviews;
    else into.set(key, { values: { ...group.values }, pageviews: group.pageviews });
  }
}

/**
 * A counting semaphore: at most `size` bodies run at once. A finishing body
 * hands its slot straight to the next waiter rather than freeing it, so a
 * caller arriving in between cannot take the slot as well.
 */
function createLimiter(size: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(body: () => Promise<T>): Promise<T> {
    if (active >= size) await new Promise<void>((resolve) => waiting.push(resolve));
    else active += 1;
    try {
      return await body();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active -= 1;
    }
  };
}

/**
 * A reader bound to one configuration. Create one per request: its concurrency
 * limit is per instance, and a request's calls should share one.
 */
export class VercelAnalyticsClient {
  private readonly run = createLimiter(CONCURRENCY);

  constructor(private readonly config: VercelAnalyticsConfig) {}

  /**
   * Every group's pageviews for `query`, complete — never folded into
   * `"Others"`. Groups with the same values across the windows the read was
   * split into are summed; order is unspecified.
   */
  async aggregatePageviews(query: PageviewsQuery): Promise<PageviewsGroup[]> {
    const merged = new Map<string, PageviewsGroup>();
    const windows = query.by.includes("day")
      ? splitDays(query.from, query.to, MAX_DAYS_PER_DAY_READ)
      : [{ from: query.from, to: query.to }];
    const results = await Promise.all(
      windows.map((window) => this.unfolded({ ...query, ...window })),
    );
    for (const groups of results) mergeInto(merged, groups);
    return [...merged.values()];
  }

  /** One window, halved until no response folds. */
  private async unfolded(query: PageviewsQuery): Promise<PageviewsGroup[]> {
    const { groups, folded } = await this.run(() => this.call(query));
    if (!folded) return groups;

    const days = daysBetween(query.from, query.to);
    if (days === 1) {
      throw new Error(
        `Vercel Web Analytics folded groups into "${FOLDED_GROUP}" for a single day (${query.from}, by ${query.by.join("+")}) — the count cannot be read completely`,
      );
    }
    const firstTo = dayOf(dayMs(query.from) + (Math.floor(days / 2) - 1) * DAY_MS);
    const secondFrom = dayOf(dayMs(firstTo) + DAY_MS);
    const halves = await Promise.all([
      this.unfolded({ ...query, to: firstTo }),
      this.unfolded({ ...query, from: secondFrom }),
    ]);
    const merged = new Map<string, PageviewsGroup>();
    for (const half of halves) mergeInto(merged, half);
    return [...merged.values()];
  }

  /** One HTTP call: its groups, and whether the response folded some of them. */
  private async call(
    query: PageviewsQuery,
  ): Promise<{ groups: PageviewsGroup[]; folded: boolean }> {
    const params = new URLSearchParams({
      teamId: this.config.teamId,
      projectId: this.config.projectId,
      // Instants, not days: "until (including) this date" on a bare day is
      // read against a granularity the call may not have, and an instant says
      // exactly which moments count.
      since: String(dayMs(query.from)),
      until: String(dayMs(query.to) + DAY_MS - 1),
      limit: String(MAX_GROUPS),
      filter: query.filter,
    });
    for (const dimension of query.by) params.append("by", dimension);

    const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${this.config.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Vercel's own body, for the log: a token without access to the project
      // and a malformed filter both arrive as a bare 4xx otherwise.
      const body = await response.text().catch(() => "");
      throw new VercelAnalyticsError(
        response.status,
        `Vercel Web Analytics refused the query (${response.status}): ${body.slice(0, 500)}`,
      );
    }

    const parsed = aggregateResponse.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error(
        `Vercel Web Analytics answered an unexpected shape: ${parsed.error.message}`,
      );
    }

    const groups = parsed.data.data.map((row): PageviewsGroup => {
      const values: PageviewsGroup["values"] = {};
      for (const dimension of query.by) {
        if (dimension === "day") {
          values.day = utcDayOfBucket(row.timestamp);
          continue;
        }
        const value = dimensionValue.safeParse(row[dimension]);
        if (!value.success) {
          throw new Error(
            `Vercel Web Analytics answered a row without its ${dimension} dimension`,
          );
        }
        // Null and the empty string are both "no value"; kept as the empty
        // string, which is how the endpoint reports an absent one.
        values[dimension] = value.data ?? "";
      }
      return { values, pageviews: row.pageviews };
    });
    // Only a full response can have folded; below the cap "Others" is a value.
    const folded =
      groups.length >= MAX_GROUPS &&
      groups.some((group) =>
        Object.entries(group.values).some(
          ([dimension, value]) => dimension !== "day" && value === FOLDED_GROUP,
        ),
      );
    return { groups, folded };
  }
}

/** A day bucket's UTC day. Buckets start at UTC midnight; anything else throws. */
function utcDayOfBucket(timestamp: string | undefined): string {
  const ms = timestamp === undefined ? Number.NaN : Date.parse(timestamp);
  if (Number.isNaN(ms) || ms % DAY_MS !== 0) {
    throw new Error(
      `Vercel Web Analytics answered a day bucket that is not a UTC midnight: ${String(timestamp)}`,
    );
  }
  return dayOf(ms);
}

/** `[from, to]` as consecutive windows of at most `size` days. */
export function splitDays(
  from: string,
  to: string,
  size: number,
): { from: string; to: string }[] {
  const windows: { from: string; to: string }[] = [];
  const end = dayMs(to);
  for (let start = dayMs(from); start <= end; start += size * DAY_MS) {
    windows.push({
      from: dayOf(start),
      to: dayOf(Math.min(end, start + (size - 1) * DAY_MS)),
    });
  }
  return windows;
}
