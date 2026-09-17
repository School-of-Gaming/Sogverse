import {
  partnerError,
  partnerJson,
  partnerRead,
  requirePartnerKey,
} from "@/lib/api/partner-auth.server";
import { parseSearchParams } from "@/lib/api/query-params.server";
import {
  partnerCampaignsQuery,
  partnerCampaignsResponse,
} from "@/services/partner/partner.contracts";
import { readPartnerCampaigns } from "@/services/partner/partner-campaigns.server";
import { partnerDb } from "@/services/partner/partner-shared-db.server";

/**
 * GET /api/partner/v1/campaigns — how many families each Lynx campaign brought
 * in, and how far they went.
 *
 * One aggregate, never records: per campaign stored with the `lynx-` prefix,
 * the parent accounts created in the requested UTC months, the children linked
 * to them now, those children possibly of Programme age today (UTC), and the
 * accounts whose family holds a live Programme seat — each count withheld as
 * null under the minimum. `to` defaults to the current month and `from` to
 * `to`. See `/docs/lynx-api` for the contract and `readPartnerCampaigns` for
 * how each count is read.
 */
export async function GET(request: Request) {
  const denied = requirePartnerKey(request);
  if (denied) return denied;

  return partnerRead("campaigns", async () => {
    const query = parseSearchParams(request.url, partnerCampaignsQuery);
    if (!query.ok) return partnerError("invalid_query", query.message);

    return partnerJson(
      partnerCampaignsResponse.parse(
        await readPartnerCampaigns(partnerDb(), query.data, new Date()),
      ),
    );
  });
}
