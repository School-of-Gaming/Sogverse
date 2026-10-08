import { z } from "zod";

/**
 * The longest message the testing tool sends. Slack takes far more, but past
 * 4,000 characters it splits a message in two, and a test message is short.
 */
export const SLACK_MESSAGE_MAX_LENGTH = 4000;

/**
 * The admin testing page's Slack send: a channel, by its id (`C0123456789`) or
 * its name, and the plain text to post there.
 */
export const sendTestSlackMessageBody = z.object({
  channel: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(SLACK_MESSAGE_MAX_LENGTH),
});
export type SendTestSlackMessageBody = z.infer<typeof sendTestSlackMessageBody>;

/** Slack took the message. */
export const sendTestSlackMessageResponse = z.object({ ok: z.literal(true) });
export type SendTestSlackMessageResponse = z.infer<typeof sendTestSlackMessageResponse>;
