import { z } from "zod";

/**
 * The confirm page's request: the raw token from the Slack link URL. The route
 * mints 32 random bytes as base64url (43 characters); the bound is generous so
 * a token is never refused for its length, only for not matching a row.
 */
export const slackLinkBody = z.object({
  token: z.string().min(1).max(256),
});
export type SlackLinkBody = z.infer<typeof slackLinkBody>;

/** The Slack account the caller's admin account is now linked to. */
export const slackLinkResponse = z.object({
  slackUsername: z.string(),
});
export type SlackLinkResponse = z.infer<typeof slackLinkResponse>;

/**
 * The refusals the confirm page explains, carried as the error body's `code`.
 * Both send the reader back to Slack for a new link; everything else is a
 * generic failure.
 */
export const SLACK_LINK_ERROR_CODES = {
  /** No such token, or it has already been used. */
  notFound: "SLACK_LINK_TOKEN_NOT_FOUND",
  /** The token's ten minutes have passed. */
  expired: "SLACK_LINK_TOKEN_EXPIRED",
} as const;
