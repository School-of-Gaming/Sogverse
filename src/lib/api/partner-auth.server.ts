import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * The partner API's authorization and error envelope — one helper for every
 * route under `/api/partner`, because a per-route copy is how one of them ends
 * up comparing its key with `===` or answering a shape the published contract
 * does not describe.
 *
 * The contract itself is the public documentation page at `/docs/lynx-api`:
 * a static key issued to one partner, presented as a Bearer token, and errors
 * carrying `{ error: { code, message } }` rather than the app's own
 * `{ error: string }`. See `src/app/api/partner/CLAUDE.md` for why the partner
 * shape wins on this surface.
 */

/**
 * The stable error codes. Stable is the point: the partner branches on the
 * code, never on the message, so a code is renamed only under a new API
 * version — the same promise the documentation page makes about field names.
 */
export type PartnerErrorCode =
  /** The key is missing, malformed, or not the issued one. */
  | "unauthorized"
  /** The key is not configured on our side — never the caller's fault. */
  | "server_misconfigured"
  /** A query parameter failed the documented schema. */
  | "invalid_query";

const STATUS_BY_CODE: Readonly<Record<PartnerErrorCode, number>> = {
  unauthorized: 401,
  server_misconfigured: 500,
  invalid_query: 400,
};

/**
 * The one way a partner route answers a failure. The status follows from the
 * code, so a route cannot ship a 401 labelled `invalid_query`.
 *
 * `message` is English prose for a human reading a log; it is not a localized
 * string and must not be shown to an end user.
 */
export function partnerError(
  code: PartnerErrorCode,
  message: string,
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status: STATUS_BY_CODE[code] },
  );
}

/**
 * Compare two secrets without leaking how far they matched.
 *
 * `timingSafeEqual` throws on a length mismatch, so the lengths are checked
 * first — which is fine: a length difference is not the leak that matters
 * here, a per-character early exit is.
 */
function secretsMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The gate every partner route runs first: returns a ready-to-return response
 * when the caller may not proceed, and `null` when they may.
 *
 *   const denied = requirePartnerKey(request);
 *   if (denied) return denied;
 *
 * Auth precedes validation everywhere, so a caller without the key cannot
 * probe the input handling by reading which parameter was rejected.
 */
export function requirePartnerKey(request: Request): NextResponse | null {
  const apiKey = process.env.LYNX_PARTNER_API_KEY;
  if (!apiKey) {
    console.error("LYNX_PARTNER_API_KEY is not configured");
    return partnerError(
      "server_misconfigured",
      "The partner API key is not configured",
    );
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return partnerError(
      "unauthorized",
      "Missing or malformed Authorization header",
    );
  }

  if (!secretsMatch(apiKey, header.slice("Bearer ".length))) {
    return partnerError("unauthorized", "Invalid API key");
  }

  return null;
}
