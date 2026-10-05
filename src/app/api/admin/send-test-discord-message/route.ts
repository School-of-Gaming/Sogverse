import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import {
  DiscordApiError,
  sendDiscordDirectMessage,
} from "@/lib/discord-api.server";
import {
  sendTestDiscordMessageBody,
  sendTestDiscordMessageResponse,
} from "@/services/discord-link/discord-link.contracts";
import { DiscordLinkService } from "@/services/discord-link/discord-link.service";

/**
 * POST /api/admin/send-test-discord-message
 *
 * The admin testing page's Discord tool: DM a plain-text message from this
 * environment's bot to a linked Sogverse account, proving the send works end
 * to end. The Discord id is looked up from the profile on the admin's own
 * session (RLS lets an admin read every link), so the client never names one.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can send test Discord messages",
  body: sendTestDiscordMessageBody,
  response: sendTestDiscordMessageResponse,

  handler: async ({ body, supabase }) => {
    const discordUserId = await new DiscordLinkService(
      supabase,
    ).getDiscordUserId(body.profileId);
    if (discordUserId === null) {
      return NextResponse.json(
        { error: "That account has no linked Discord account" },
        { status: 400 },
      );
    }

    try {
      const sent = await sendDiscordDirectMessage(discordUserId, {
        content: body.content,
      });
      return { jumpUrl: sent.jumpUrl };
    } catch (error) {
      // Discord's own refusal goes back to the admin verbatim: this is a test
      // tool, and "Cannot send messages to this user (50007)" is the answer
      // they need, where a generic failure would hide it.
      if (error instanceof DiscordApiError) {
        const code = error.discordCode === null ? "" : ` (${error.discordCode})`;
        return NextResponse.json(
          { error: `Discord refused: ${error.message}${code}` },
          { status: 502 },
        );
      }
      throw error;
    }
  },
});
