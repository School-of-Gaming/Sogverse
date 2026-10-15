import { formatInTimeZone } from "date-fns-tz";

import { PATHNAMES } from "@/i18n/pathnames";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/constants/locales";

/**
 * The pure half of the admin analytics page: which days a read covers, how
 * Vercel's groups and the database's rows are normalised and joined, and the
 * cache key. Nothing here reads anything; `admin-analytics.server.ts` does the
 * reading and hands the results through these.
 *
 * **Every day is a UTC day.** Vercel buckets its counts at UTC midnight, so the
 * signups are bucketed the same way and the page says so — one day boundary for
 * every figure on it, never Helsinki for one source and UTC for another.
 */

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// The range
// ---------------------------------------------------------------------------

/** The quick ranges: the last N UTC days, today included. */
export const ANALYTICS_PRESETS = [7, 30, 90] as const;
export type AnalyticsPreset = (typeof ANALYTICS_PRESETS)[number];

/** The range a bare `/admin/analytics` opens on. */
export const DEFAULT_ANALYTICS_PRESET: AnalyticsPreset = 30;

/** The UTC days the page covers, both inclusive, and the preset it was opened by. */
export interface AnalyticsRange {
  from: string;
  to: string;
  /** Null for a custom range, even one that happens to span a preset's days. */
  preset: AnalyticsPreset | null;
}

const BARE_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A `YYYY-MM-DD` that names a real calendar day, or null. */
function parseDay(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !BARE_DAY.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(ms) || dayOf(ms) !== value ? null : value;
}

function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function dayOf(ms: number): string {
  return formatInTimeZone(ms, "UTC", "yyyy-MM-dd");
}

/** `day` moved by `n` UTC days. */
export function addDays(day: string, n: number): string {
  return dayOf(dayMs(day) + n * DAY_MS);
}

/** Today's UTC day at `now`. */
export function utcToday(now: Date): string {
  return dayOf(now.getTime());
}

/** Every UTC day from `from` to `to`, both inclusive, ascending. */
export function daysOf(from: string, to: string): string[] {
  const days: string[] = [];
  for (let ms = dayMs(from); ms <= dayMs(to); ms += DAY_MS) days.push(dayOf(ms));
  return days;
}

/**
 * The range the address asks for, made one the counts can answer.
 *
 * `from` and `to` both well-formed is a custom range: a reversed pair is read
 * the right way round, and each end is clamped to the days a count can exist
 * on — `earliest` through today. Anything else — a preset, or nothing usable —
 * is the last N days ending today, defaulting to `DEFAULT_ANALYTICS_PRESET`.
 * The address is the admin's own, so a malformed one is answered with the
 * default rather than refused.
 */
export function resolveAnalyticsRange(
  params: {
    range?: string | string[];
    from?: string | string[];
    to?: string | string[];
  },
  now: Date,
  earliest: string,
): AnalyticsRange {
  const today = utcToday(now);
  const clamp = (day: string) => (day < earliest ? earliest : day > today ? today : day);

  const from = parseDay(params.from);
  const to = parseDay(params.to);
  if (from !== null && to !== null) {
    const [start, end] = from <= to ? [from, to] : [to, from];
    return { from: clamp(start), to: clamp(end), preset: null };
  }

  const preset =
    ANALYTICS_PRESETS.find((days) => String(days) === params.range) ?? DEFAULT_ANALYTICS_PRESET;
  return { from: clamp(addDays(today, -(preset - 1))), to: today, preset };
}

/**
 * The part of the range the edge request log can answer: the days of it inside
 * the log's last `logDays` days, today included, or null when none are.
 */
export function requestLogWindow(
  range: { from: string; to: string },
  today: string,
  logDays: number,
): { from: string; to: string } | null {
  const oldest = addDays(today, -(logDays - 1));
  const from = range.from < oldest ? oldest : range.from;
  return from > range.to ? null : { from, to: range.to };
}

// ---------------------------------------------------------------------------
// The cache key
// ---------------------------------------------------------------------------

/**
 * What a cached Vercel read is stored under: the read, the days it covers, and
 * the current UTC hour, `YYYY-MM-DDTHH`. The hour is in the key so no entry is
 * ever served outside the hour it was read in — Next's cache hands out a stale
 * entry once before refreshing it, and without the hour the first admin after
 * a quiet day would be shown that day's counts.
 */
export interface AnalyticsCacheKey {
  read: string;
  from: string;
  to: string;
  hour: string;
}

export function analyticsCacheKey(
  read: string,
  range: { from: string; to: string },
  now: Date,
): AnalyticsCacheKey {
  return {
    read,
    from: range.from,
    to: range.to,
    hour: formatInTimeZone(now, "UTC", "yyyy-MM-dd'T'HH"),
  };
}

// ---------------------------------------------------------------------------
// What the sections are handed
// ---------------------------------------------------------------------------

/**
 * One section's figures, or why there are none. A failure is never an empty
 * result: zero pageviews and "Vercel did not answer" must never look the same.
 */
export type AnalyticsResult<T> =
  | {
      ok: true;
      data: T;
      /** When the figures were read from their source, ISO 8601. */
      readAt: string;
    }
  | {
      ok: false;
      /**
       * `refused`: Vercel answered that the token may not read this — a lasting
       * state the owner has to fix, never worth retrying. `failed`: anything
       * else, which may pass.
       */
      reason: "unconfigured" | "refused" | "failed";
    };

/** One UTC day's Web Analytics counts. */
export interface DayVisits {
  day: string;
  pageviews: number;
  visitors: number;
}

export interface WebAnalyticsOverview {
  /** Every day of the range, a day with no views at zero. */
  days: DayVisits[];
  pageviews: number;
  /** Distinct visitor ids across the whole range — not the sum of the days'. */
  visitors: number;
}

export interface ServedPageLoads {
  /** The days the request log answered for; null when the range lies wholly before them. */
  window: { from: string; to: string } | null;
  days: { day: string; count: number }[];
  total: number;
}

/** A UTM value as both sources mean it: Vercel's `""` and the database's NULL are both "none". */
export function normaliseUtm(value: string | null | undefined): string | null {
  return value === undefined || value === null || value === "" ? null : value;
}

// ---------------------------------------------------------------------------
// Over time
// ---------------------------------------------------------------------------

/** A day of Web Analytics as Vercel answers it, already parsed. */
export interface VisitsByDayGroup {
  values: { day?: string };
  pageviews: number;
  visitors: number;
}

/**
 * Every day of the range with its counts, a day Vercel answered nothing for at
 * zero. A bucket outside the range throws: the read asked for none, and
 * dropping it would change a total silently.
 */
export function buildDayVisits(
  range: { from: string; to: string },
  groups: readonly VisitsByDayGroup[],
): DayVisits[] {
  const byDay = new Map<string, DayVisits>();
  for (const group of groups) {
    const day = group.values.day;
    if (day === undefined || day < range.from || day > range.to) {
      throw new Error(`analytics: a day bucket ${String(day)} lies outside ${range.from}..${range.to}`);
    }
    byDay.set(day, { day, pageviews: group.pageviews, visitors: group.visitors });
  }
  return daysOf(range.from, range.to).map(
    (day) => byDay.get(day) ?? { day, pageviews: 0, visitors: 0 },
  );
}

/** One row of the over-time chart. A null is a figure not read for that day — a gap, never a zero. */
export interface TimelineRow {
  day: string;
  pageviews: number | null;
  visitors: number | null;
  served: number | null;
  signups: number | null;
}

export function buildTimeline(
  range: { from: string; to: string },
  sources: {
    visits: readonly DayVisits[] | null;
    served: ServedPageLoads | null;
    signups: readonly { day: string; signups: number }[] | null;
  },
): TimelineRow[] {
  const visits = new Map(sources.visits?.map((row) => [row.day, row]));
  const served = new Map(sources.served?.days.map((row) => [row.day, row.count]));
  const signups = new Map(sources.signups?.map((row) => [row.day, row.signups]));
  return daysOf(range.from, range.to).map((day) => ({
    day,
    pageviews: visits.get(day)?.pageviews ?? null,
    visitors: visits.get(day)?.visitors ?? null,
    served: served.get(day) ?? null,
    signups: sources.signups === null ? null : (signups.get(day) ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// Signups
// ---------------------------------------------------------------------------

/** A parent account as the signups read takes it: when it was created, and its campaign labels. */
export interface SignupRow {
  created_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

/** A campaign label triple and how many parent accounts it brought. */
export interface SignupCampaignCount {
  campaign: string | null;
  source: string | null;
  medium: string | null;
  signups: number;
}

export interface SignupTally {
  total: number;
  days: { day: string; signups: number }[];
  campaigns: SignupCampaignCount[];
}

/**
 * Counts, and nothing else, out of the parent accounts created in the range:
 * how many per UTC day, and how many per campaign label triple. No account
 * survives this function — only what leaves it is ever shown, because a
 * campaign tied to one person's account beside what they did on the site is
 * what `src/lib/utm.ts` forbids.
 */
export function tallySignups(range: { from: string; to: string }, rows: readonly SignupRow[]): SignupTally {
  const days = new Map(daysOf(range.from, range.to).map((day) => [day, 0]));
  const campaigns = new Map<string, SignupCampaignCount>();
  for (const row of rows) {
    const day = formatInTimeZone(new Date(row.created_at), "UTC", "yyyy-MM-dd");
    const count = days.get(day);
    if (count === undefined) {
      throw new Error(`analytics: an account created on ${day} lies outside ${range.from}..${range.to}`);
    }
    days.set(day, count + 1);

    const label = {
      campaign: normaliseUtm(row.utm_campaign),
      source: normaliseUtm(row.utm_source),
      medium: normaliseUtm(row.utm_medium),
    };
    const key = JSON.stringify([label.campaign, label.source, label.medium]);
    const existing = campaigns.get(key);
    if (existing) existing.signups += 1;
    else campaigns.set(key, { ...label, signups: 1 });
  }
  return {
    total: rows.length,
    days: [...days].map(([day, signups]) => ({ day, signups })),
    campaigns: [...campaigns.values()],
  };
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

/** A Web Analytics group from a two-way campaign read. */
export interface CampaignViewGroup {
  values: { utmCampaign?: string; utmSource?: string; utmMedium?: string };
  pageviews: number;
}

/** One value of a campaign's source or medium, with what it counted on each side. */
export interface CampaignLabelCount {
  value: string | null;
  pageviews: number;
  signups: number;
}

/** One campaign's row: views and signups side by side, with the sources and mediums behind them. */
export interface CampaignRow {
  /** Null is "no campaign" — no UTM on the visit, or none stored on the account. */
  campaign: string | null;
  pageviews: number;
  signups: number;
  sources: CampaignLabelCount[];
  mediums: CampaignLabelCount[];
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Most first by views then signups, then by value; the empty label last. */
function byWeight<T extends { pageviews: number; signups: number }>(
  label: (entry: T) => string | null,
) {
  return (a: T, b: T) => {
    const aNone = label(a) === null;
    const bNone = label(b) === null;
    if (aNone !== bNone) return aNone ? 1 : -1;
    return (
      b.pageviews - a.pageviews ||
      b.signups - a.signups ||
      compareText(label(a) ?? "", label(b) ?? "")
    );
  };
}

/**
 * The campaigns table: each campaign's pageviews beside the parent accounts it
 * brought, joined on the campaign value after normalising Vercel's `""` and the
 * database's NULL to one "no campaign".
 *
 * Vercel takes two groupings a read, so a campaign's views arrive twice — by
 * campaign and source, and by campaign and medium — and each read sums to the
 * same views. The source read is the one counted; the medium read only names
 * the mediums. Values are matched exactly, letter case included, because both
 * sides store them as the link spelled them.
 */
export function buildCampaigns(
  bySource: readonly CampaignViewGroup[],
  byMedium: readonly CampaignViewGroup[],
  signups: readonly SignupCampaignCount[],
): CampaignRow[] {
  const rows = new Map<string, CampaignRow>();
  const rowFor = (campaign: string | null): CampaignRow => {
    const key = JSON.stringify(campaign);
    let row = rows.get(key);
    if (!row) {
      row = { campaign, pageviews: 0, signups: 0, sources: [], mediums: [] };
      rows.set(key, row);
    }
    return row;
  };
  const add = (
    list: CampaignLabelCount[],
    value: string | null,
    counts: { pageviews: number; signups: number },
  ) => {
    const existing = list.find((entry) => entry.value === value);
    if (existing) {
      existing.pageviews += counts.pageviews;
      existing.signups += counts.signups;
    } else {
      list.push({ value, ...counts });
    }
  };

  for (const group of bySource) {
    if (group.pageviews === 0) continue;
    const row = rowFor(normaliseUtm(group.values.utmCampaign));
    row.pageviews += group.pageviews;
    add(row.sources, normaliseUtm(group.values.utmSource), { pageviews: group.pageviews, signups: 0 });
  }
  for (const group of byMedium) {
    if (group.pageviews === 0) continue;
    const row = rowFor(normaliseUtm(group.values.utmCampaign));
    add(row.mediums, normaliseUtm(group.values.utmMedium), { pageviews: group.pageviews, signups: 0 });
  }
  for (const count of signups) {
    const row = rowFor(count.campaign);
    row.signups += count.signups;
    add(row.sources, count.source, { pageviews: 0, signups: count.signups });
    add(row.mediums, count.medium, { pageviews: 0, signups: count.signups });
  }

  const sortLabels = byWeight<CampaignLabelCount>((entry) => entry.value);
  return [...rows.values()]
    .map((row) => ({
      ...row,
      sources: [...row.sources].sort(sortLabels),
      mediums: [...row.mediums].sort(sortLabels),
    }))
    .sort(byWeight<CampaignRow>((row) => row.campaign));
}

// ---------------------------------------------------------------------------
// Pages, by route and language
// ---------------------------------------------------------------------------

/** Where a path's views are filed by language: its locale prefix, or none. */
export type PathLanguage = SupportedLocale | "none";

/** The language a served path was read in, from its locale prefix. */
export function pathLanguage(path: string): PathLanguage {
  const first = path.split("/")[1] ?? "";
  // exact-locale: reads the locale prefix off a served address, not a written version
  return SUPPORTED_LOCALES.find((locale) => locale === first) ?? "none";
}

/**
 * The OData filter for every path served in one locale: the locale's own home
 * (`/fi`) or anything beneath it. A path without a locale prefix is what is
 * left of a route's views once each locale's are counted.
 */
export function localePathFilter(locale: SupportedLocale): string {
  return `(requestPath eq '/${locale}' or startswith(requestPath, '/${locale}/'))`;
}

/** A page's views across every language, and in each one it was read in. */
export interface RouteRow {
  route: string;
  pageviews: number;
  languages: { language: PathLanguage; pageviews: number }[];
}

/**
 * The top pages: one row per route, every language on it, each with the
 * languages it was read in. `byLocale` holds one read per locale, each grouped
 * by route; whatever of a route's views no locale read claims was served
 * without a locale prefix (a path from before addresses carried one). A locale
 * claiming more of a route than the route's own total means the reads disagree
 * — a view landing between them — and the language split is left off that row
 * rather than shown wrong.
 */
export function buildRoutes(
  byRoute: readonly { values: { route?: string }; pageviews: number }[],
  byLocale: ReadonlyMap<SupportedLocale, readonly { values: { route?: string }; pageviews: number }[]>,
): RouteRow[] {
  const perLocale = new Map<string, Map<SupportedLocale, number>>();
  for (const [locale, groups] of byLocale) {
    for (const group of groups) {
      const route = group.values.route ?? "";
      const counts = perLocale.get(route) ?? new Map<SupportedLocale, number>();
      // exact-locale: tallies views per address prefix, not a written version
      counts.set(locale, (counts.get(locale) ?? 0) + group.pageviews);
      perLocale.set(route, counts);
    }
  }

  const totals = new Map<string, number>();
  for (const group of byRoute) {
    const route = group.values.route ?? "";
    totals.set(route, (totals.get(route) ?? 0) + group.pageviews);
  }

  return [...totals]
    .filter(([, pageviews]) => pageviews > 0)
    .map(([route, pageviews]): RouteRow => {
      const counts = perLocale.get(route) ?? new Map<SupportedLocale, number>();
      const claimed = [...counts.values()].reduce((sum, n) => sum + n, 0);
      const languages: RouteRow["languages"] =
        claimed > pageviews
          ? []
          : [
              ...SUPPORTED_LOCALES.flatMap((language) => {
                const n = counts.get(language) ?? 0;
                return n > 0 ? [{ language, pageviews: n }] : [];
              }),
              ...(pageviews > claimed ? [{ language: "none" as const, pageviews: pageviews - claimed }] : []),
            ].sort((a, b) => b.pageviews - a.pageviews);
      return { route, pageviews, languages };
    })
    .sort((a, b) => b.pageviews - a.pageviews || compareText(a.route, b.route));
}

// ---------------------------------------------------------------------------
// Landing pages
// ---------------------------------------------------------------------------

/** The `route` every landing page's views are filed under, in every language. */
export const LANDING_PAGE_ROUTE = "/discover/[idOrSlug]";

/** A landing page as the analytics page needs it: its titles, and every slug it has had on record. */
export interface LandingPageEntry {
  id: string;
  /** The working copy's versions, for the title in the reader's language. */
  versions: { locale: SupportedLocale; title: string }[];
  /** Every slug on record per locale — the working copy's and the live one's. */
  slugs: { locale: SupportedLocale; slug: string }[];
}

/**
 * Every path a landing page is served at: its id under each locale's segment,
 * and each slug under its own locale's — a slug resolves in its own locale
 * only. Derived from the pathnames map, so a translated segment added there is
 * counted here without an edit.
 */
export function landingPagePaths(page: LandingPageEntry): string[] {
  const templates = PATHNAMES[LANDING_PAGE_ROUTE];
  const at = (locale: SupportedLocale, idOrSlug: string) =>
    `/${locale}${templates[locale].replace("[idOrSlug]", idOrSlug)}`;
  return [
    ...new Set([
      ...SUPPORTED_LOCALES.map((locale) => at(locale, page.id)),
      ...page.slugs.map(({ locale, slug }) => at(locale, slug)),
    ]),
  ];
}

/** One landing page's views, or a path no page on record answers to (a slug since changed). */
export interface LandingPageRow {
  page: { id: string; versions: LandingPageEntry["versions"] } | null;
  /** Set only on an unmatched row: the path that was served. */
  path: string | null;
  pageviews: number;
  languages: { language: PathLanguage; pageviews: number }[];
}

/**
 * The landing pages table: each `/discover/…` path's views filed under the
 * page it belongs to, by every id and slug on record. A path no page answers
 * to — a slug changed since, a page that never existed — keeps a row of its
 * own under its path, so no view is dropped and none is guessed onto a page.
 */
export function buildLandingPages(
  groups: readonly { values: { requestPath?: string }; pageviews: number }[],
  pages: readonly LandingPageEntry[],
): LandingPageRow[] {
  const pageByPath = new Map<string, LandingPageEntry>();
  for (const page of pages) {
    for (const path of landingPagePaths(page)) pageByPath.set(path, page);
  }

  const rows = new Map<string, LandingPageRow>();
  for (const group of groups) {
    if (group.pageviews === 0) continue;
    const path = group.values.requestPath ?? "";
    const page = pageByPath.get(path) ?? null;
    const key = page ? `page:${page.id}` : `path:${path}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        page: page ? { id: page.id, versions: page.versions } : null,
        path: page ? null : path,
        pageviews: 0,
        languages: [],
      };
      rows.set(key, row);
    }
    row.pageviews += group.pageviews;
    const language = pathLanguage(path);
    const entry = row.languages.find((item) => item.language === language);
    if (entry) entry.pageviews += group.pageviews;
    else row.languages.push({ language, pageviews: group.pageviews });
  }

  return [...rows.values()]
    .map((row) => ({ ...row, languages: [...row.languages].sort((a, b) => b.pageviews - a.pageviews) }))
    .sort((a, b) => {
      if ((a.page === null) !== (b.page === null)) return a.page === null ? 1 : -1;
      return b.pageviews - a.pageviews || compareText(a.path ?? a.page?.id ?? "", b.path ?? b.page?.id ?? "");
    });
}

// ---------------------------------------------------------------------------
// Breakdowns
// ---------------------------------------------------------------------------

/** One value of a breakdown and its views; the empty value is null. */
export interface BreakdownRow {
  value: string | null;
  pageviews: number;
}

/**
 * A one-dimension breakdown, most viewed first, with the empty value — no
 * referrer, an unknown country — kept as a row of its own at null. Every row is
 * returned: the section decides how many to show, and the total is the sum.
 */
export function buildBreakdown(
  groups: readonly { values: Partial<Record<string, string>>; pageviews: number }[],
  dimension: string,
): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  for (const group of groups) {
    if (group.pageviews === 0) continue;
    const value = normaliseUtm(group.values[dimension]);
    const key = JSON.stringify(value);
    const existing = rows.get(key);
    if (existing) existing.pageviews += group.pageviews;
    else rows.set(key, { value, pageviews: group.pageviews });
  }
  return [...rows.values()].sort(
    (a, b) => b.pageviews - a.pageviews || compareText(a.value ?? "", b.value ?? ""),
  );
}
