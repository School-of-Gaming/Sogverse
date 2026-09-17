import {
  partnerError,
  partnerJson,
  partnerRead,
  requirePartnerKey,
} from "@/lib/api/partner-auth.server";
import { parseSearchParams } from "@/lib/api/query-params.server";
import { vercelAnalyticsConfig } from "@/lib/vercel-analytics.server";
import {
  partnerTrafficQuery,
  partnerTrafficResponse,
} from "@/services/partner/partner.contracts";
import { partnerDb } from "@/services/partner/partner-shared-db.server";
import { readPartnerTraffic } from "@/services/partner/partner-traffic.server";

/**
 * GET /api/partner/v1/traffic — views of the pages a Lynx campaign can land on,
 * grouped by the campaign that brought them.
 *
 * Read from Vercel Web Analytics: the Roblox landing page, the shop, and each
 * Programme product's page that had a view, every language of a page counted
 * as one. Each page's views are split by campaign, by source and medium, and by
 * UTC day, and each split sums to the page's total. `from`/`to` are UTC days,
 * defaulting to the last thirty. The resolved answer is cached for the hour, so
 * counts can be up to an hour old. See `/docs/lynx-api` for the contract.
 *
 * Unset Vercel credentials are our misconfiguration, not the caller's mistake,
 * so they answer 500 `server_misconfigured` — the same answer, and the same
 * place in the order, as an unset partner key: after the gate, before the query
 * is read.
 */
export async function GET(request: Request) {
  const denied = requirePartnerKey(request);
  if (denied) return denied;

  const analytics = vercelAnalyticsConfig();
  if (!analytics.ok) {
    console.error(
      `partner API traffic: Vercel Web Analytics is not configured (${analytics.missing.join(", ")} unset)`,
    );
    return partnerError(
      "server_misconfigured",
      "The traffic source is not configured",
    );
  }

  return partnerRead("traffic", async () => {
    const query = parseSearchParams(request.url, partnerTrafficQuery);
    if (!query.ok) return partnerError("invalid_query", query.message);

    return partnerJson(
      partnerTrafficResponse.parse(
        await readPartnerTraffic(partnerDb(), analytics.config, query.data, new Date()),
      ),
    );
  });
}
