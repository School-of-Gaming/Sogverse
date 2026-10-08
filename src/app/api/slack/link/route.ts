import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import {
  SLACK_LINK_ERROR_CODES,
  slackLinkBody,
  slackLinkResponse,
} from "@/services/slack-link/slack-link.contracts";

/**
 * POST /api/slack/link — an admin confirming, from the `/link-slack` page,
 * that the Slack account which ran the link command is theirs.
 *
 * The token is spent by the database function on the caller's own session: it
 * hashes the raw token, refuses every role but admin, deletes the row so the
 * token works once, and replaces the caller's previous link. Nothing here
 * touches the token table, which only the service role can read.
 *
 * The page only ever reaches this from its button, so a link opened by a
 * preview bot or a scanner spends nothing.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["admin"],
  body: slackLinkBody,
  response: slackLinkResponse,

  handler: async ({ body, supabase }) => {
    const { data, error } = await supabase.rpc("consume_slack_link_token", {
      p_token: body.token,
    });

    if (error) {
      // The two refusals the reader can act on — ask Slack for a new link —
      // keep a code the page can tell apart. A role refusal (42501) falls
      // through to the shared table's 403.
      if (error.code === "P0032") {
        throw new ApiError(
          "slack link token not found or already used",
          404,
          SLACK_LINK_ERROR_CODES.notFound,
        );
      }
      if (error.code === "P0033") {
        throw new ApiError("slack link token expired", 410, SLACK_LINK_ERROR_CODES.expired);
      }
      throw error;
    }

    return { slackUsername: data };
  },
});
