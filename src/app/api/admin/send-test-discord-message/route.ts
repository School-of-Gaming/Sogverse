import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import {
  DiscordApiError,
  sendDiscordDirectMessages,
} from "@/lib/discord-api.server";
import {
  buildSubPreviewFlow,
  discordSubLogoUrl,
  loadDiscordSubCopy,
} from "@/lib/discord-substitution-message";
import { sendableImageOrigin } from "@/lib/email-templates/render-context";
import { ROUTES } from "@/lib/constants/routes";
import type { SupportedLocale } from "@/lib/constants/locales";
import {
  buildSubstitutionPreviewFlow,
  loadDiscordSubOfferCopy,
} from "@/lib/substitution-notifications/discord-dm-message";
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
 * Two templates: plain `text`, or `subFlow` — every message the `/sub` command
 * can draw and then every DM a substitution request sends, as a set of DMs in
 * the chosen locale, built by the live builders over sample sessions. Its
 * controls carry the preview prefix, so a press on one answers "this is a
 * preview" and changes nothing, and its link carries a fixed token that links
 * nothing.
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

    const messages: readonly [unknown, ...unknown[]] =
      body.template === "text"
        ? [{ content: body.content }]
        : await buildPreviewSet(body.locale, getOrigin(request));

    try {
      const sent = await sendDiscordDirectMessages(discordUserId, messages);
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

/**
 * Every message the bot draws about substitutions, in the order a gedu meets
 * them: the `/sub` command's steps, then a substitution request's DMs.
 */
async function buildPreviewSet(
  locale: SupportedLocale,
  origin: string,
): Promise<[unknown, ...unknown[]]> {
  // This environment's own site, or none where Discord could not fetch the
  // logo or open the link — a send from a dev machine.
  const sendableOrigin = sendableImageOrigin();
  const logoUrl = discordSubLogoUrl(sendableOrigin);
  const now = new Date();
  const offerCopy = await loadDiscordSubOfferCopy(locale);
  return [
    ...buildSubPreviewFlow({
      copy: await loadDiscordSubCopy(locale),
      logoUrl,
      now,
      origin,
    }),
    ...buildSubstitutionPreviewFlow({
      copy: offerCopy,
      logoUrl,
      now,
      mySogUrl:
        sendableOrigin === null
          ? null
          : new URL(ROUTES.gedu.dashboard, sendableOrigin).toString(),
      refusalLine: offerCopy.pool("poolActionFailed"),
    }),
  ];
}
