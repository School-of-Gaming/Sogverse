import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import {
  isSlackConfigured,
  postSlackBlocksInOrder,
  postSlackMessage,
  SlackApiError,
} from "@/lib/slack-api.server";
import { buildSubstitutionSlackPreviewSet } from "@/lib/substitution-notifications/slack-preview";
import { getOrigin } from "@/lib/url";
import {
  sendTestSlackMessageBody,
  sendTestSlackMessageResponse,
} from "@/services/slack/slack.contracts";

/**
 * POST /api/admin/send-test-slack-message
 *
 * The admin testing page's Slack tool: post to a channel from this
 * environment's Slack bot, proving the send works end to end.
 *
 * Two templates: plain `text`, or `subFlow` — every message the staff channel
 * can show about a substitution request, then the three ephemeral replies
 * posted as labelled messages, built by the live builder over sample requests.
 * Its controls carry the preview prefix, so a press on one answers "this is a
 * preview" and changes nothing, and its link carries a fixed token that links
 * nothing.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can send test Slack messages",
  body: sendTestSlackMessageBody,
  response: sendTestSlackMessageResponse,

  handler: async ({ body, request }) => {
    // An environment with no bot is a setup gap, not a fault: say which one.
    if (!isSlackConfigured()) {
      return NextResponse.json(
        { error: "Slack is not configured in this environment: SLACK_BOT_TOKEN is unset" },
        { status: 503 },
      );
    }

    try {
      if (body.template === "text") {
        await postSlackMessage(body.channel, body.text);
      } else {
        await postSlackBlocksInOrder(
          body.channel,
          buildSubstitutionSlackPreviewSet({ now: new Date(), origin: getOrigin(request) }),
        );
      }
      return { ok: true } as const;
    } catch (error) {
      // Slack's own refusal goes back to the admin verbatim: this is a test
      // tool, and "channel_not_found" or "invalid_blocks" is the answer they
      // need, where a generic failure would hide it.
      if (error instanceof SlackApiError) {
        return NextResponse.json(
          { error: `Slack refused: ${error.slackCode}` },
          { status: 502 },
        );
      }
      throw error;
    }
  },
});
