import {
  partnerError,
  partnerJson,
  requirePartnerKey,
} from "@/lib/api/partner-auth.server";
import { parseSearchParams } from "@/lib/api/query-params.server";
import {
  CAMPAIGN_MINIMUM_COUNT,
  partnerCampaignsQuery,
  partnerCampaignsResponse,
} from "@/services/partner/partner.contracts";

/** A UTC calendar month, `YYYY-MM` — the month an account's creation falls in. */
function utcMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * The months the answer covers: what the caller asked for, and otherwise the
 * documented defaults — `to` is the current month, and `from` is the month
 * `to` names. The skeleton resolves them although it counts nothing, for the
 * reason `/traffic` does: the aggregate always says what it covers.
 */
function resolveRange(from: string | undefined, to: string | undefined) {
  const end = to ?? utcMonth(new Date());
  return { from: from ?? end, to: end };
}

/**
 * GET /api/partner/v1/campaigns — how many families each Lynx campaign brought
 * in, and how far they went.
 *
 * Skeleton: it authenticates the caller and validates the query exactly as
 * `/docs/lynx-api` documents, then answers the documented aggregate with an
 * empty `campaigns` array. See `src/app/api/partner/CLAUDE.md`. The counts, and
 * withholding the ones under the minimum, are what the implementation adds.
 */
export function GET(request: Request) {
  const denied = requirePartnerKey(request);
  if (denied) return denied;

  const query = parseSearchParams(request.url, partnerCampaignsQuery);
  if (!query.ok) return partnerError("invalid_query", query.message);

  return partnerJson(
    partnerCampaignsResponse.parse({
      range: resolveRange(query.data.from, query.data.to),
      minimum_count: CAMPAIGN_MINIMUM_COUNT,
      campaigns: [],
    }),
  );
}
