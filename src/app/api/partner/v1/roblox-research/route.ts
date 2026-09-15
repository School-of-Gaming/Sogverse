import {
  partnerError,
  partnerJson,
  requirePartnerKey,
} from "@/lib/api/partner-auth.server";
import { parseSearchParams } from "@/lib/api/query-params.server";
import {
  partnerRobloxResearchQuery,
  partnerRobloxResearchResponse,
} from "@/services/partner/partner.contracts";

/**
 * GET /api/partner/v1/roblox-research — the individual-level dataset the
 * Programme's privacy policy allows to be passed to Roblox, and nothing beyond
 * it.
 *
 * Skeleton: it authenticates the caller and validates the query exactly as
 * `/docs/lynx-api` documents, then answers the documented envelope with no
 * records. See `src/app/api/partner/CLAUDE.md`. The validated filters are
 * deliberately unread — reading them is what the implementation adds.
 */
export function GET(request: Request) {
  const denied = requirePartnerKey(request);
  if (denied) return denied;

  const query = parseSearchParams(request.url, partnerRobloxResearchQuery);
  if (!query.ok) return partnerError("invalid_query", query.message);

  return partnerJson(
    partnerRobloxResearchResponse.parse({ data: [], next_cursor: null }),
  );
}
