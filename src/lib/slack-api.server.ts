import "server-only";
import { z } from "zod";

/**
 * Calling Slack's Web API as this environment's bot.
 *
 * The token is the environment's own `SLACK_BOT_TOKEN`, the `xoxb-` Bot User
 * OAuth Token of a Slack app made for this — a separate app from the Stripe
 * Workflows for Slack app behind the purchase notifications. Setting one up,
 * once, at api.slack.com/apps:
 *
 * 1. Create an app for the workspace and give it the Bot Token Scope
 *    `chat:write` (plus `chat:write.public` to post to public channels the bot
 *    is not a member of).
 * 2. Install it to the workspace, which mints the token. The install may need
 *    a workspace admin's approval, depending on the workspace's settings.
 * 3. A private channel needs the bot in it: `/invite @<bot>` there.
 * 4. The token goes in `.env.local` as `SLACK_BOT_TOKEN`, and on Vercel through
 *    the CLI (the vercel-env-vars skill), sensitive on Preview and Production.
 *
 * Slack answers a refusal with HTTP 200 and `{ ok: false, error }` in the body,
 * so every call made here reads `ok`, never the status.
 */

export const SLACK_API_BASE = "https://slack.com/api";

/** Whether this environment has a bot token to send with. */
export function isSlackConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN);
}

/**
 * Slack refused a request. Carries Slack's own error code (`channel_not_found`,
 * `not_in_channel`, `missing_scope`, …), which is the whole of what Slack says.
 */
export class SlackApiError extends Error {
  constructor(readonly slackCode: string) {
    super(slackCode);
    this.name = "SlackApiError";
  }
}

/** The envelope every Web API answer shares. */
const slackEnvelope = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
});

async function slackAnswer<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  const envelope = slackEnvelope.safeParse(payload);
  if (!envelope.success) {
    throw new SlackApiError(`HTTP ${response.status}`);
  }
  if (!envelope.data.ok) {
    throw new SlackApiError(envelope.data.error ?? "unknown_error");
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("Slack accepted the request but answered in an unexpected shape");
  }
  return parsed.data;
}

function slackAuthorization(): string {
  return `Bearer ${process.env.SLACK_BOT_TOKEN}`;
}

const postMessageAnswer = z.object({ channel: z.string(), ts: z.string() });
const permalinkAnswer = z.object({ permalink: z.string().url() });

export interface SentSlackMessage {
  /** The channel's id, whichever way the caller named it. */
  channel: string;
  /** The message's timestamp, which is Slack's id for it within the channel. */
  ts: string;
  /** A link that opens the message in Slack. */
  permalink: string;
}

/**
 * Post plain text to a channel, named by its id (`C0123456789`) or its name,
 * with link and media previews off, and answer where it landed. A channel the
 * bot cannot post to comes back as a `SlackApiError`.
 */
export async function postSlackMessage(
  channel: string,
  text: string,
): Promise<SentSlackMessage> {
  const posted = await slackAnswer(
    await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: slackAuthorization(),
      },
      body: JSON.stringify({
        channel,
        text,
        unfurl_links: false,
        unfurl_media: false,
      }),
    }),
    postMessageAnswer,
  );
  // The permalink needs no scope beyond the one that posted the message.
  const params = new URLSearchParams({ channel: posted.channel, message_ts: posted.ts });
  const { permalink } = await slackAnswer(
    await fetch(`${SLACK_API_BASE}/chat.getPermalink?${params}`, {
      headers: { Authorization: slackAuthorization() },
    }),
    permalinkAnswer,
  );
  return { channel: posted.channel, ts: posted.ts, permalink };
}
