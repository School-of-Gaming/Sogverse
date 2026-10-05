import { z } from "zod";

/**
 * The confirm page's request: the raw token from the `/link` URL. The bot
 * mints 32 random bytes as base64url (43 characters); the bound is generous
 * so a token is never refused for its length, only for not matching a row.
 */
export const discordLinkBody = z.object({
  token: z.string().min(1).max(256),
});
export type DiscordLinkBody = z.infer<typeof discordLinkBody>;

/** The Discord account the caller's Sogverse account is now linked to. */
export const discordLinkResponse = z.object({
  discordUsername: z.string(),
});
export type DiscordLinkResponse = z.infer<typeof discordLinkResponse>;

/**
 * The refusals the confirm page explains, carried as the error body's `code`.
 * Both send the reader back to Discord to run `/link` again; everything else
 * is a generic failure.
 */
export const DISCORD_LINK_ERROR_CODES = {
  /** No such token, or it has already been used. */
  notFound: "DISCORD_LINK_TOKEN_NOT_FOUND",
  /** The token's ten minutes have passed. */
  expired: "DISCORD_LINK_TOKEN_EXPIRED",
} as const;
