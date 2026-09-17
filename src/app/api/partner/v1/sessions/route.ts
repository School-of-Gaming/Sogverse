import {
  partnerError,
  partnerJson,
  partnerRead,
  requirePartnerKey,
} from "@/lib/api/partner-auth.server";
import { parseSearchParams } from "@/lib/api/query-params.server";
import {
  partnerSessionsQuery,
  partnerSessionsResponse,
} from "@/services/partner/partner.contracts";
import { readPartnerSessions } from "@/services/partner/partner-sessions.server";
import { partnerDb } from "@/services/partner/partner-shared-db.server";

/**
 * GET /api/partner/v1/sessions — every session a Programme group has recorded.
 *
 * A session is returned once a Game Educator has written its report or marked
 * anyone's attendance; a session row holding only a staff note or a photograph
 * is not one. Each carries its product and group, its scheduled window, one
 * mark per marked participant and the report's photographs as public URLs;
 * ascending by session id, a page at a time. `from`/`to` bound the session's
 * calendar day in its product's timezone. See `/docs/lynx-api` for the contract.
 */
export async function GET(request: Request) {
  const denied = requirePartnerKey(request);
  if (denied) return denied;

  return partnerRead("sessions", async () => {
    const query = parseSearchParams(request.url, partnerSessionsQuery);
    if (!query.ok) return partnerError("invalid_query", query.message);

    return partnerJson(
      partnerSessionsResponse.parse(await readPartnerSessions(partnerDb(), query.data)),
    );
  });
}
