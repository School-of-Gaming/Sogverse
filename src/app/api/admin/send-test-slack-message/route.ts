import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import {
  isSlackConfigured,
  postSlackMessage,
  SlackApiError,
} from "@/lib/slack-api.server";
import {
  sendTestSlackMessageBody,
  sendTestSlackMessageResponse,
} from "@/services/slack/slack.contracts";

/**
 * POST /api/admin/send-test-slack-message
 *
 * The admin testing page's Slack tool: post plain text to a channel from this
 * environment's Slack bot, proving the send works end to end.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can send test Slack messages",
  body: sendTestSlackMessageBody,
  response: sendTestSlackMessageResponse,

  handler: async ({ body }) => {
    // An environment with no bot is a setup gap, not a fault: say which one.
    if (!isSlackConfigured()) {
      return NextResponse.json(
        { error: "Slack is not configured in this environment: SLACK_BOT_TOKEN is unset" },
        { status: 503 },
      );
    }

    try {
      const sent = await postSlackMessage(body.channel, body.text);
      return { permalink: sent.permalink };
    } catch (error) {
      // Slack's own refusal goes back to the admin verbatim: this is a test
      // tool, and "channel_not_found" or "not_in_channel" is the answer they
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
