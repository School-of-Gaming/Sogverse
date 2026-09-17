import {
  partnerError,
  partnerJson,
  partnerRead,
  requirePartnerKey,
} from "@/lib/api/partner-auth.server";
import { parseSearchParams } from "@/lib/api/query-params.server";
import {
  partnerRobloxResearchQuery,
  partnerRobloxResearchResponse,
} from "@/services/partner/partner.contracts";
import { readRobloxResearch } from "@/services/partner/partner-roblox-research.server";
import { partnerDb } from "@/services/partner/partner-shared-db.server";

/**
 * GET /api/partner/v1/roblox-research — the individual-level dataset the
 * Programme's privacy policy allows to be passed to Roblox, and nothing beyond
 * it.
 *
 * One row per live seat a child holds on a Programme product, provided the child
 * has a Roblox username on file, paged in the order of the seats the rows derive
 * from. `product_id` narrows to one product and `from`/`to` to products whose
 * start date falls in the range. A row carries no identifier of the child or
 * the family; the response schema is what holds it to that. The read lives in
 * `partner-roblox-research.server.ts`; the contract is the `/docs/lynx-api` page.
 */
export async function GET(request: Request) {
  const denied = requirePartnerKey(request);
  if (denied) return denied;

  return partnerRead("roblox-research", async () => {
    const query = parseSearchParams(request.url, partnerRobloxResearchQuery);
    if (!query.ok) return partnerError("invalid_query", query.message);

    return partnerJson(
      partnerRobloxResearchResponse.parse(
        await readRobloxResearch(partnerDb(), query.data),
      ),
    );
  });
}
