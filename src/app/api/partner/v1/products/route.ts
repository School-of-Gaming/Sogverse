import {
  partnerError,
  partnerJson,
  partnerRead,
  requirePartnerKey,
} from "@/lib/api/partner-auth.server";
import { parseSearchParams } from "@/lib/api/query-params.server";
import {
  partnerProductsQuery,
  partnerProductsResponse,
} from "@/services/partner/partner.contracts";
import { readPartnerProducts } from "@/services/partner/partner-products.server";
import { partnerDb } from "@/services/partner/partner-shared-db.server";

/**
 * GET /api/partner/v1/products — the Programme catalogue.
 *
 * Every product that requires the Programme's terms, listed in the shop or not,
 * with its names, audience, place, derived status and groups; ascending by
 * product id, a page at a time. `status` filters on the effective status as it
 * stands at the moment of the request. See `/docs/lynx-api` for the contract
 * and `readPartnerProducts` for how the derived filter pages.
 */
export async function GET(request: Request) {
  const denied = requirePartnerKey(request);
  if (denied) return denied;

  return partnerRead("products", async () => {
    const query = parseSearchParams(request.url, partnerProductsQuery);
    if (!query.ok) return partnerError("invalid_query", query.message);

    return partnerJson(
      partnerProductsResponse.parse(
        await readPartnerProducts(partnerDb(), query.data, new Date()),
      ),
    );
  });
}
