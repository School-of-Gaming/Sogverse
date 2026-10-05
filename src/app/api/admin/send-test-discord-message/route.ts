import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { ROUTES } from "@/lib/constants/routes";
import {
  DiscordApiError,
  sendDiscordDirectMessage,
} from "@/lib/discord-api.server";
import {
  DISCORD_FLAG_SUPPRESS_EMBEDS,
  buildLinkReplyContent,
  buildSessionPickerMessage,
  buildSubNotLinkedContent,
  buildSubPreviewSessions,
  discordSubLogoUrl,
  loadDiscordSubCopy,
} from "@/lib/discord-substitution-message";
import { sendableImageOrigin } from "@/lib/email-templates/render-context";
import { getOrigin } from "@/lib/url";
import {
  sendTestDiscordMessageBody,
  sendTestDiscordMessageResponse,
} from "@/services/discord-link/discord-link.contracts";
import { DiscordLinkService } from "@/services/discord-link/discord-link.service";

/**
 * POST /api/admin/send-test-discord-message
 *
 * The admin testing page's Discord tool: DM a linked Sogverse account from
 * this environment's bot, proving the send works end to end. The Discord id is
 * looked up from the profile on the admin's own session (RLS lets an admin read
 * every link), so the client never names one.
 *
 * Three templates: plain `text`, or one of the `/sub` command's two answers,
 * built by the command's own builders in the chosen locale: `subSessions`, the
 * first step over sample sessions (its controls carry the preview
 * prefix, so a press on one answers "this is a preview" and files nothing), or
 * `subNotLinked`, what a caller with no linked account is told, whose link carries a fixed
 * token that links nothing.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can send test Discord messages",
  body: sendTestDiscordMessageBody,
  response: sendTestDiscordMessageResponse,

  handler: async ({ body, supabase, request }) => {
    const service = new DiscordLinkService(supabase);
    const discordUserId = await service.getDiscordUserId(body.profileId);
    if (discordUserId === null) {
      return NextResponse.json(
        { error: "That account has no linked Discord account" },
        { status: 400 },
      );
    }

    let message: unknown;
    if (body.template === "text") {
      message = { content: body.content };
    } else if (body.template === "subNotLinked") {
      const copy = await loadDiscordSubCopy(body.locale);
      message = {
        content: buildSubNotLinkedContent({
          copy,
          // The real URL shape with a token no row holds: the page shows its
          // dead-link card for it, and nothing is minted.
          linkReply: buildLinkReplyContent(
            `${getOrigin(request)}${ROUTES.linkDiscord}?token=preview`,
          ),
        }),
        flags: DISCORD_FLAG_SUPPRESS_EMBEDS,
      };
    } else {
      const copy = await loadDiscordSubCopy(body.locale);
      const now = new Date();
      message = buildSessionPickerMessage({
        copy,
        // This environment's own site, or no logo where Discord could not
        // fetch one — a send from a dev machine.
        logoUrl: discordSubLogoUrl(sendableImageOrigin()),
        sessions: buildSubPreviewSessions(now),
        now,
        page: 0,
        prefix: "subpreview",
        // A bare path, which the proxy sends on to the reader's own locale.
        substitutionsUrl: `${getOrigin(request)}${ROUTES.gedu.substitutions}`,
      });
    }

    try {
      const sent = await sendDiscordDirectMessage(discordUserId, message);
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
