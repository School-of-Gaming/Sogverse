import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { getOrigin } from "@/lib/url";
import {
  oauthConsentBody,
  oauthConsentResponse,
} from "@/services/oauth-consent/oauth-consent.contracts";

/**
 * POST /api/oauth/consent — an admin approving or denying an AI app's request
 * to connect to the MCP endpoint, from the consent page's two buttons.
 *
 * The decision is recorded by Supabase Auth on the admin's own session, and
 * Supabase answers with where the browser goes next: the client's registered
 * redirect URI, carrying the code or the refusal. That URL is the only
 * external destination in the flow, and it is handed back rather than
 * followed, so the page leaves with a full navigation of its own.
 *
 * Admin-only to mirror the page's refusal, which is a matter of experience,
 * not enforcement: any signed-in user can approve their own authorization
 * straight against Supabase Auth, so a non-admin can hold a grant whatever this
 * route does. What makes the MCP endpoint admin-only is its role check on
 * every request.
 */
const answerAuthorization = defineRoute({
  posture: "role-gated",
  roles: "admin",
  body: oauthConsentBody,
  response: oauthConsentResponse,

  handler: async ({ body, supabase }) => {
    const options = { skipBrowserRedirect: true };
    const { data, error } =
      body.decision === "approve"
        ? await supabase.auth.oauth.approveAuthorization(body.authorizationId, options)
        : await supabase.auth.oauth.denyAuthorization(body.authorizationId, options);

    // An authorization already answered, expired, or never this admin's is
    // refused by Supabase with a 4xx; the page tells the admin to start again
    // from their AI app, which is the only way to get a new one.
    if (error) {
      throw new ApiError(
        `OAuth ${body.decision} failed: ${error.message}`,
        error.status && error.status < 500 ? 400 : 502,
      );
    }
    return { redirectUrl: data.redirect_url };
  },
});

/**
 * Refused before the session is read unless the browser vouches that the
 * request came from this site's own page. An approval forged from another site
 * would hand an AI app an admin's grant, and the session cookie's SameSite=Lax
 * is otherwise this route's only defence — the JSON body parse does not check
 * the content type, so a cross-site form post is not refused for being one.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return answerAuthorization(request);
}

/**
 * Whether the browser says this request came from the app's own origin.
 *
 * `Sec-Fetch-Site`, where sent, must be `same-origin`; `Origin`, where sent,
 * must be the app's own origin. A request carrying neither is refused too:
 * every current browser sends `Origin` on a POST, a same-origin `fetch`
 * included, so only a client that is not a browser — and so holds no victim's
 * cookie to forge with — arrives without both.
 */
function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if (fetchSite === null && origin === null) return false;
  if (fetchSite !== null && fetchSite !== "same-origin") return false;
  // Through the URL parser, since the configured fallback may end in a slash.
  if (origin !== null && origin !== new URL(getOrigin(request)).origin) return false;
  return true;
}
