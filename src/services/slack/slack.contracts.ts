import { z } from "zod";

/**
 * The longest message the testing tool sends. Slack takes far more, but past
 * 4,000 characters it splits a message in two, and a test message is short.
 */
export const SLACK_MESSAGE_MAX_LENGTH = 4000;

/** A channel, by its id (`C0123456789`) or its name. */
const slackChannel = z.string().trim().min(1).max(100);

/**
 * The admin testing page's Slack send: the channel to post in, and which
 * template — plain `text`, or `subFlow`, every message the staff channel can
 * show about a substitution request, built by the server over sample requests.
 */
export const sendTestSlackMessageBody = z.discriminatedUnion("template", [
  z.object({
    template: z.literal("text"),
    channel: slackChannel,
    text: z.string().trim().min(1).max(SLACK_MESSAGE_MAX_LENGTH),
  }),
  z.object({
    template: z.literal("subFlow"),
    channel: slackChannel,
  }),
]);
export type SendTestSlackMessageBody = z.infer<typeof sendTestSlackMessageBody>;

/** Slack took the message — every one of them, for a set. */
export const sendTestSlackMessageResponse = z.object({ ok: z.literal(true) });
export type SendTestSlackMessageResponse = z.infer<typeof sendTestSlackMessageResponse>;
