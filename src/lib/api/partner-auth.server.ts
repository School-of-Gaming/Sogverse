import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

/**
 * The partner API's wire layer: how a caller is authorized, how a response is
 * built, and the headers every response carries. One module for every route
 * under `/api/partner`, because a per-route copy is how one of them ends up
 * comparing its key with `===`, answering a shape the published contract does
 * not describe, or letting a page of children's data be cached.
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
  /** A query parameter failed the documented schema, the cursor included. */
  | "invalid_query"
  /** No resource lives at this path under `/api/partner`. */
  | "not_found"
  /**
   * Something failed on our side while answering — a read, or an answer that
   * would not have matched the published shape. Logged in full server-side;
   * the caller learns only that it was not their fault.
   */
  | "internal_error";

const STATUS_BY_CODE: Readonly<Record<PartnerErrorCode, number>> = {
  unauthorized: 401,
  server_misconfigured: 500,
  invalid_query: 400,
  not_found: 404,
  internal_error: 500,
};

/**
 * The headers every partner response carries, success and failure alike.
 *
 * `private, no-store` because the answer is scoped to the key that asked for
 * it and is, by design, personal data about families and children: nothing
 * between us and Lynx — a proxy, a CDN, the partner's own HTTP cache — may
 * keep a copy, and an erasure honoured in one pull must not be undone by a
 * cached page of the previous one. It sits on the one response builder rather
 * than on each route so a route cannot forget it.
 */
const PARTNER_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "private, no-store",
};

/** The one way a partner route builds a response. */
export function partnerJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: PARTNER_HEADERS });
}

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
  return partnerJson({ error: { code, message } }, STATUS_BY_CODE[code]);
}

/**
 * A caller's mistake found below the route — a cursor that does not decode, in
 * practice — thrown so the read that found it need not thread a result type
 * back up through every layer between it and the handler.
 *
 * `partnerRead` turns it into a 400 `invalid_query` carrying this message, so
 * the message follows the same rule as `parseSearchParams`: it names the
 * parameter it is about (`cursor: …`) and is English for a log.
 */
export class PartnerQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartnerQueryError";
  }
}

/**
 * Run a partner route's body and guarantee the answer is in the envelope.
 *
 *   export async function GET(request: Request) {
 *     const denied = requirePartnerKey(request);
 *     if (denied) return denied;
 *     return partnerRead("products", async () => {
 *       const query = parseSearchParams(request.url, partnerProductsQuery);
 *       if (!query.ok) return partnerError("invalid_query", query.message);
 *       return partnerJson(partnerProductsResponse.parse(await read(query.data)));
 *     });
 *   }
 *
 * Without it a failed read or a response that fails its own schema would reach
 * the partner as Next's HTML 500 — the one shape the published page promises
 * never to send. With it:
 *
 * - a thrown `PartnerQueryError` answers 400 `invalid_query` with its message;
 * - anything else thrown answers 500 `internal_error` with a fixed message, and
 *   the error itself goes to the server log under `label`, never to the caller:
 *   what failed and why is ours to read, and a database message quoted back
 *   over the wire tells an outsider about our schema.
 *
 * The key check stays outside, called by the route itself: the route registry
 * asserts each partner route file contains that call, and a gate hidden inside
 * a helper is a gate the check cannot see.
 */
export async function partnerRead(
  label: string,
  body: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof PartnerQueryError) {
      return partnerError("invalid_query", error.message);
    }
    console.error(`partner API ${label}: answering internal_error`, error);
    return partnerError(
      "internal_error",
      "The request could not be answered because of an error on our side",
    );
  }
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

  // The scheme is case-insensitive per RFC 7235, and an HTTP client that sends
  // `bearer` is not malformed — refusing it would be our bug presented as the
  // partner's. What must be there is a non-empty token after it.
  const header = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.*)$/i.exec(header)?.[1].trim() ?? "";
  // Length, not equality: a presence check is not a secret comparison, and
  // writing it as one both reads as a leak and trips the lint rule that hunts
  // for real ones.
  if (token.length === 0) {
    return partnerError(
      "unauthorized",
      "Missing or malformed Authorization header",
    );
  }

  if (!secretsMatch(apiKey, token)) {
    return partnerError("unauthorized", "Invalid API key");
  }

  return null;
}
