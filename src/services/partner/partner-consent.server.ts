import "server-only";

import { PartnerQueryError } from "@/lib/api/partner-auth.server";
import { consentAnswerTotalsResult, type ConsentAnswerTotals } from "@/lib/consent-answers.contracts";
import { ROUTES } from "@/lib/constants/routes";
import {
  CONSENT_ANSWER,
  type PartnerConsentQuery,
  type PartnerConsentResponse,
} from "./partner.contracts";
import { readProgrammeProductIds } from "./partner-scope.server";
import type { PartnerDb } from "./partner-shared-db.server";

/**
 * `/consent` — how the cookie banner was answered on the pages a Lynx campaign
 * lands on, from our own tally of the banner's first answers.
 *
 * **The same pages as `/traffic`, and no others.** The tally names a page by
 * its locale-stripped internal path, every marketing page alike, and a NULL
 * page for everywhere else. The partner sees the Roblox landing page (its three
 * format addresses as one page), the shop listing, and each Programme
 * product's page; the NULL bucket, the home page, About, sign-up, sign-in, the
 * other landing pages and every other product's page are dropped before the
 * answer is built.
 *
 * **Read live, never cached.** One grouped read of a small table, on the
 * service role (the function is granted to it alone), so nothing here needs
 * the hour-long cache `/traffic` keeps for Vercel's rate limit.
 */

type ConsentPage = PartnerConsentResponse["pages"][number];
type ConsentCounts = ConsentPage["answers"];

/** The tally's internal paths of the Roblox landing page, one page at three addresses. */
const LANDING_PATHS: ReadonlySet<string> = new Set([
  ROUTES.roblox,
  ROUTES.robloxOnline,
  ROUTES.robloxAll,
]);
const SHOP_PATH = "/shop";
const PRODUCT_PATH = /^\/shop\/([^/]+)$/;

/** The documented default window: the last thirty UTC days, today included. */
const DEFAULT_RANGE_DAYS = 30;

const DAY_MS = 86_400_000;

/** A UTC day, `YYYY-MM-DD`. */
function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The days the answer covers: what the caller asked for, else the thirty UTC
 * days ending on `to`, which itself defaults to today. A range reaching past
 * today is answered up to today, because `range` is the days the counts
 * cover and a day to come has none yet. There is no lower clamp: a day before
 * counting began holds no answers, which is the truthful count for it.
 *
 * Refused as the caller's mistake (→ 400 naming the parameter): a `from`
 * later than the `to` a default completed, and a range that starts after
 * today, which has no day to answer for.
 */
export function resolveConsentRange(
  from: string | undefined,
  to: string | undefined,
  now: Date,
): { from: string; to: string } {
  const today = utcDay(now.getTime());
  const end = to ?? today;
  const start = from ?? utcDay(Date.parse(`${end}T00:00:00Z`) - (DEFAULT_RANGE_DAYS - 1) * DAY_MS);
  if (start > end) {
    throw new PartnerQueryError(`from: must be on or before to, which defaults to today (${end})`);
  }
  if (start > today) {
    throw new PartnerQueryError(
      from === undefined
        ? `from: defaults to the 30 days ending on to (${start}), which lies after today (${today})`
        : `from: must be on or before today (${today})`,
    );
  }
  return { from: start, to: end > today ? today : end };
}

function emptyCounts(): ConsentCounts {
  return { all: 0, analytics_only: 0, marketing_only: 0, none: 0 };
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The partner's pages from the tally's rows: the landing page and the shop
 * always, at zero when nobody answered there, then each Programme product
 * whose page had an answer, ascending by id. Every other row is dropped.
 */
export function buildConsentPages(
  rows: ConsentAnswerTotals,
  programme: ReadonlySet<string>,
): ConsentPage[] {
  const landing = emptyCounts();
  const shop = emptyCounts();
  const products = new Map<string, ConsentCounts>();

  for (const row of rows) {
    if (row.page === null) continue;
    let counts: ConsentCounts | undefined;
    if (LANDING_PATHS.has(row.page)) counts = landing;
    else if (row.page === SHOP_PATH) counts = shop;
    else {
      const productId = PRODUCT_PATH.exec(row.page)?.[1];
      if (productId === undefined || !programme.has(productId)) continue;
      counts = products.get(productId) ?? emptyCounts();
      products.set(productId, counts);
    }
    counts[row.answer] += row.count;
  }

  const entry = (
    page: ConsentPage["page"],
    productId: string | null,
    answers: ConsentCounts,
  ): ConsentPage => ({
    page,
    product_id: productId,
    answered: CONSENT_ANSWER.reduce((sum, answer) => sum + answers[answer], 0),
    answers,
  });

  return [
    entry("landing", null, landing),
    entry("shop", null, shop),
    ...[...products.entries()]
      .sort(([a], [b]) => compareText(a, b))
      .map(([id, answers]) => entry("product", id, answers)),
  ];
}

/** The `/consent` answer for a parsed query, read live. */
export async function readPartnerConsent(
  db: PartnerDb,
  query: PartnerConsentQuery,
  now: Date,
): Promise<PartnerConsentResponse> {
  const range = resolveConsentRange(query.from, query.to, now);
  const [totals, programme] = await Promise.all([
    db.rpc("consent_answer_totals", { p_from: range.from, p_to: range.to }),
    readProgrammeProductIds(db),
  ]);
  if (totals.error) throw totals.error;
  return {
    range,
    pages: buildConsentPages(consentAnswerTotalsResult.parse(totals.data), new Set(programme)),
  };
}
