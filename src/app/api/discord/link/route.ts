import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import {
  DISCORD_LINK_ERROR_CODES,
  discordLinkBody,
  discordLinkResponse,
} from "@/services/discord-link/discord-link.contracts";

/**
 * POST /api/discord/link — a Gedu or an admin confirming, from the
 * `/link-discord` page, that the Discord account which ran `/link` is theirs.
 *
 * The token is spent by the database function on the caller's own session: it
 * hashes the raw token, refuses every role but gedu and admin, deletes the row
 * so the token works once, and replaces the caller's previous link. Nothing
 * here touches the token table, which only the service role can read.
 *
 * The page only ever reaches this from its button, so a link opened by a
 * preview bot or a mail scanner spends nothing.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["admin", "gedu"],
  body: discordLinkBody,
  response: discordLinkResponse,

  handler: async ({ body, supabase }) => {
    const { data, error } = await supabase.rpc("consume_discord_link_token", {
      p_token: body.token,
    });

    if (error) {
      // The two refusals the reader can act on — run `/link` again — keep a
      // code the page can tell apart. A role refusal (42501) falls through to
      // the shared table's 403.
      if (error.code === "P0029") {
        throw new ApiError(
          "discord link token not found or already used",
          404,
          DISCORD_LINK_ERROR_CODES.notFound,
        );
      }
      if (error.code === "P0030") {
        throw new ApiError(
          "discord link token expired",
          410,
          DISCORD_LINK_ERROR_CODES.expired,
        );
      }
      throw error;
    }

    return { discordUsername: data };
  },
});
