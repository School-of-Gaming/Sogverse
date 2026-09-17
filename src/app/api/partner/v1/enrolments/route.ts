import {
  partnerError,
  partnerJson,
  partnerRead,
  requirePartnerKey,
} from "@/lib/api/partner-auth.server";
import { parseSearchParams } from "@/lib/api/query-params.server";
import {
  partnerEnrolmentsQuery,
  partnerEnrolmentsResponse,
} from "@/services/partner/partner.contracts";
import { readEnrolments } from "@/services/partner/partner-enrolments.server";
import { partnerDb } from "@/services/partner/partner-shared-db.server";

/**
 * GET /api/partner/v1/enrolments — one record per seat on a Programme product:
 * its status, the consents behind it, how much its participant attended and
 * what they published.
 *
 * Every live seat — active, waitlisted or completed — on a product that requires
 * the Programme's terms, in ascending seat id. `product_id`, `participant_id`
 * and `parent_id` (the account holding the seat) narrow in the database;
 * `status` matches the reported status, which follows the product's own, so a
 * held seat on a completed product answers to `completed` and not to `active`.
 * The read lives in `partner-enrolments.server.ts`; the contract is the
 * `/docs/lynx-api` page.
 */
export async function GET(request: Request) {
  const denied = requirePartnerKey(request);
  if (denied) return denied;

  return partnerRead("enrolments", async () => {
    const query = parseSearchParams(request.url, partnerEnrolmentsQuery);
    if (!query.ok) return partnerError("invalid_query", query.message);

    return partnerJson(
      partnerEnrolmentsResponse.parse(
        await readEnrolments(partnerDb(), query.data, new Date()),
      ),
    );
  });
}
