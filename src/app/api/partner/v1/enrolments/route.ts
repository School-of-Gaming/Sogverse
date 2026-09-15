import { NextResponse } from "next/server";
import { partnerError, requirePartnerKey } from "@/lib/api/partner-auth.server";
import { parseSearchParams } from "@/lib/api/query-params.server";
import {
  partnerEnrolmentsQuery,
  partnerEnrolmentsResponse,
} from "@/services/partner/partner.contracts";

/**
 * GET /api/partner/v1/enrolments — one record per seat a child holds on a
 * Programme product.
 *
 * Skeleton: it authenticates the caller and validates the query exactly as
 * `/docs/lynx-api` documents, then answers the documented envelope with no
 * records. See `src/app/api/partner/CLAUDE.md`. The validated filters are
 * deliberately unread — reading them is what the implementation adds.
 */
export function GET(request: Request) {
  const denied = requirePartnerKey(request);
  if (denied) return denied;

  const query = parseSearchParams(request.url, partnerEnrolmentsQuery);
  if (!query.ok) return partnerError("invalid_query", query.message);

  return NextResponse.json(
    partnerEnrolmentsResponse.parse({ data: [], next_cursor: null }),
  );
}
