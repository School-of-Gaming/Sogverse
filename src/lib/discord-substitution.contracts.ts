import { z } from "zod";

/**
 * Wire contracts for the Discord bot's `/sub` command, beside the server module
 * that reads them. Only the shape no web surface already reads lives here: the
 * seat rows, the summaries and the request document parse through the web's
 * own schemas.
 */

/**
 * The SQLSTATE every Discord-facing substitution function raises when the
 * Discord user id has no gedu account linked to it — no link at all, or links
 * only to accounts that are not gedus. The bot answers it by asking the person
 * to run `/link` first.
 */
export const DISCORD_GEDU_NOT_LINKED_SQLSTATE = "P0031";

/** `get_gedu_for_discord_user`: which gedu a Discord user id acts as. */
export const discordLinkedGedu = z.object({
  profile_id: z.string(),
  /** `profiles.locale` as stored: null when the gedu never chose one. */
  locale: z.string().nullable(),
});
export type DiscordLinkedGedu = z.infer<typeof discordLinkedGedu>;
