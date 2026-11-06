import {
  partnerError,
  partnerJson,
  partnerRead,
  requirePartnerKey,
} from "@/lib/api/partner-auth.server";
import { parseSearchParams } from "@/lib/api/query-params.server";
import {
  partnerConsentQuery,
  partnerConsentResponse,
} from "@/services/partner/partner.contracts";
import { readPartnerConsent } from "@/services/partner/partner-consent.server";
import { partnerDb } from "@/services/partner/partner-shared-db.server";

/**
 * GET /api/partner/v1/consent — how visitors answered the cookie banner on the
 * pages a Lynx campaign can land on.
 *
 * Read live from our own tally of the banner's first answers: the Roblox
 * landing page, the shop, and each Programme product's page that had an
 * answer, each with a count per answer. `from`/`to` are UTC days, defaulting
 * to the last thirty. See `/docs/lynx-api` for the contract and
 * `readPartnerConsent` for how the pages are scoped.
 */
export async function GET(request: Request) {
  const denied = requirePartnerKey(request);
  if (denied) return denied;

  return partnerRead("consent", async () => {
    const query = parseSearchParams(request.url, partnerConsentQuery);
    if (!query.ok) return partnerError("invalid_query", query.message);

    return partnerJson(
      partnerConsentResponse.parse(await readPartnerConsent(partnerDb(), query.data, new Date())),
    );
  });
}
