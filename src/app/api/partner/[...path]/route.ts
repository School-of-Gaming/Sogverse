import { partnerError, requirePartnerKey } from "@/lib/api/partner-auth.server";

/**
 * Every path under `/api/partner` that is not a documented resource — a
 * mistyped resource, a version that does not exist, a path below a real
 * resource — answers the published envelope with `not_found`, never Next's
 * HTML 404. A partner's error handling is written against the envelope, and a
 * page of HTML is the one answer it cannot parse.
 *
 * The documented routes are static segments and always win over this
 * catch-all, so a real resource never reaches it, and a method a real resource
 * does not take keeps the framework's 405 there.
 *
 * **Auth first, then the 404.** Answering 404 to a caller without the key would
 * let anyone map which paths exist by the difference between 401 and 404; with
 * the key checked first, an unauthenticated probe learns the same 401 wherever
 * it points.
 *
 * Every method is answered, not only GET: an unknown path is unknown whatever
 * it was asked with, and a 405 would claim that something lives there.
 */
async function notFound(request: Request) {
  const denied = requirePartnerKey(request);
  if (denied) return denied;

  const { pathname } = new URL(request.url);
  return partnerError("not_found", `No partner API resource at ${pathname}`);
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
