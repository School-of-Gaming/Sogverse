import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
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
 * Admin-only here as on the page: a grant to anyone else would be refused at
 * the endpoint anyway, and refusing it here keeps a non-admin from holding one.
 */
export const POST = defineRoute({
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
