import {
  partnerError,
  partnerJson,
  partnerRead,
  requirePartnerKey,
} from "@/lib/api/partner-auth.server";
import { parseSearchParams } from "@/lib/api/query-params.server";
import {
  partnerFeedbackQuery,
  partnerFeedbackResponse,
} from "@/services/partner/partner.contracts";
import { readPartnerFeedback } from "@/services/partner/partner-feedback.server";
import { partnerDb } from "@/services/partner/partner-shared-db.server";

/**
 * GET /api/partner/v1/feedback — what one child answered at the end of one
 * session.
 *
 * One row per child per session window on a Programme product: their ratings,
 * their note and how they left, with the group, the product and the recorded
 * session of that group on that day (or `null`). Children only; a row with no
 * rating and no note is not one. A row has no id of its own, so it pages by
 * `(participant_id, group_id, session_opened_at)`. `from`/`to` bound the
 * session's calendar day in its product's timezone. See `/docs/lynx-api` for
 * the contract.
 */
export async function GET(request: Request) {
  const denied = requirePartnerKey(request);
  if (denied) return denied;

  return partnerRead("feedback", async () => {
    const query = parseSearchParams(request.url, partnerFeedbackQuery);
    if (!query.ok) return partnerError("invalid_query", query.message);

    return partnerJson(
      partnerFeedbackResponse.parse(await readPartnerFeedback(partnerDb(), query.data)),
    );
  });
}
