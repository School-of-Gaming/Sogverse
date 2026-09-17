import {
  partnerError,
  partnerJson,
  partnerRead,
  requirePartnerKey,
} from "@/lib/api/partner-auth.server";
import { parseSearchParams } from "@/lib/api/query-params.server";
import {
  partnerFamiliesQuery,
  partnerFamiliesResponse,
} from "@/services/partner/partner.contracts";
import { readPartnerFamilies } from "@/services/partner/partner-families.server";
import { partnerDb } from "@/services/partner/partner-shared-db.server";

/**
 * GET /api/partner/v1/families — a parent and the children of theirs who are
 * in scope.
 *
 * Every family with a member holding a live seat on a Programme product: its
 * parents, and only its in-scope gamers, ascending by the family's smallest
 * parent id, a page at a time. `marketing_consent=granted` and `utm_campaign`
 * admit a family when any one of its parents matches. A parent's email is
 * present only while their own Lynx marketing consent is granted. See
 * `/docs/lynx-api` for the contract and `readPartnerFamilies` for how a family
 * is assembled and paged.
 */
export async function GET(request: Request) {
  const denied = requirePartnerKey(request);
  if (denied) return denied;

  return partnerRead("families", async () => {
    const query = parseSearchParams(request.url, partnerFamiliesQuery);
    if (!query.ok) return partnerError("invalid_query", query.message);

    return partnerJson(
      partnerFamiliesResponse.parse(
        await readPartnerFamilies(partnerDb(), query.data),
      ),
    );
  });
}
