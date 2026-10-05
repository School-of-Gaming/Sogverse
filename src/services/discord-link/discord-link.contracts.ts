import { z } from "zod";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";

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

/** Discord's cap on a message's plain-text content. */
export const DISCORD_MESSAGE_MAX_LENGTH = 2000;

/**
 * The admin testing page's Discord send: which linked Sogverse account to DM,
 * and what — plain `text`, or a `subPreview` of the `/sub` command's first step
 * over sample sessions. The recipient is named by profile, never by Discord id
 * — the route looks the Discord account up itself.
 */
export const sendTestDiscordMessageBody = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text"),
    profileId: z.string().uuid(),
    content: z.string().trim().min(1).max(DISCORD_MESSAGE_MAX_LENGTH),
  }),
  z.object({
    kind: z.literal("subPreview"),
    profileId: z.string().uuid(),
    /** The locale to render the preview in. */
    locale: z.enum(SUPPORTED_LOCALES),
    /** Which `/sub` message: the session list, or the answer to a caller who is not linked. */
    variant: z.enum(["sessions", "notLinked"]),
  }),
]);
export type SendTestDiscordMessageBody = z.infer<typeof sendTestDiscordMessageBody>;

/** Where the sent message is: a link that opens it in Discord. */
export const sendTestDiscordMessageResponse = z.object({
  jumpUrl: z.string().url(),
});
export type SendTestDiscordMessageResponse = z.infer<
  typeof sendTestDiscordMessageResponse
>;
