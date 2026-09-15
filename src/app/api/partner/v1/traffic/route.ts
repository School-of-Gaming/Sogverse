import { NextResponse } from "next/server";
import { partnerError, requirePartnerKey } from "@/lib/api/partner-auth.server";
import { parseSearchParams } from "@/lib/api/query-params.server";
import {
  partnerTrafficQuery,
  partnerTrafficResponse,
} from "@/services/partner/partner.contracts";

/** A UTC calendar day, `YYYY-MM-DD` — the day a traffic count is bucketed by. */
function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

function shiftDays(day: string, days: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS));
}

/**
 * The range the answer covers: what the caller asked for, and the documented
 * last thirty days where they asked for nothing. The aggregate always says
 * which days it counted, so the skeleton resolves the window even though it
 * counts nothing in it — the alternative is a response that would have to
 * change shape once the counts arrive.
 */
function resolveRange(from: string | undefined, to: string | undefined) {
  const end = to ?? utcDay(new Date());
  return { from: from ?? shiftDays(end, -29), to: end };
}

/**
 * GET /api/partner/v1/traffic — views of the pages a Lynx campaign can land on,
 * grouped by the campaign that brought them.
 *
 * Skeleton: it authenticates the caller and validates the query exactly as
 * `/docs/lynx-api` documents, then answers the documented aggregate with an
 * empty `pages` array. See `src/app/api/partner/CLAUDE.md`. Nothing here calls
 * Vercel Web Analytics; that call, and the hour-long cache the documentation
 * promises around it, are what the implementation adds. The page filters are
 * validated and deliberately unread for the same reason.
 */
export function GET(request: Request) {
  const denied = requirePartnerKey(request);
  if (denied) return denied;

  const query = parseSearchParams(request.url, partnerTrafficQuery);
  if (!query.ok) return partnerError("invalid_query", query.message);

  return NextResponse.json(
    partnerTrafficResponse.parse({
      range: resolveRange(query.data.from, query.data.to),
      pages: [],
    }),
  );
}
