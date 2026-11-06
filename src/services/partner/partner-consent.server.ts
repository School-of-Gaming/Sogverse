import "server-only";

import { consentAnswerTotalsResult, type ConsentAnswerTotals } from "@/lib/consent-answers.contracts";
import { ROUTES } from "@/lib/constants/routes";
import {
  CONSENT_ANSWER,
  type PartnerConsentQuery,
  type PartnerConsentResponse,
} from "./partner.contracts";
import { readProgrammeProductIds } from "./partner-scope.server";
import type { PartnerDb } from "./partner-shared-db.server";
import { compareText, resolveCountedRange } from "./partner-shared-values";

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

function emptyCounts(): ConsentCounts {
  return { all: 0, analytics_only: 0, marketing_only: 0, none: 0 };
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
  const range = resolveCountedRange(query.from, query.to, now);
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
