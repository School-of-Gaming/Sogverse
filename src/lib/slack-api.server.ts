import "server-only";
import { z } from "zod";

/**
 * Calling Slack's Web API as this environment's bot.
 *
 * The token is the environment's own `SLACK_BOT_TOKEN`, the `xoxb-` Bot User
 * OAuth Token of a Slack app made for this — a separate app from the Stripe
 * Workflows for Slack app behind the purchase notifications. Staging and prod
 * are **two separate Slack apps**, as with Discord: `.env.local` and Vercel
 * Preview hold the staging app's `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` and
 * `SLACK_SUBSTITUTIONS_CHANNEL_ID`, Vercel Production holds the prod app's, and
 * `.env.local` also keeps the prod set as `SLACK_*_PRODUCTION` for the
 * Production writes. The code reads only the unsuffixed names. Setting an app
 * up is in `src/lib/substitution-notifications/CLAUDE.md` (Operator setup).
 *
 * Slack answers a refusal with HTTP 200 and `{ ok: false, error }` in the body,
 * so every Web API call made here reads `ok`, never the status.
 */

const SLACK_API_BASE = "https://slack.com/api";

/** Whether this environment has a bot token to send with. */
export function isSlackConfigured(): boolean {
  return Boolean(process.env.SLACK_BOT_TOKEN);
}

/**
 * Whether this environment can post the substitution messages: a bot token
 * and the channel they go to.
 */
export function isSlackSubstitutionsConfigured(): boolean {
  return isSlackConfigured() && Boolean(process.env.SLACK_SUBSTITUTIONS_CHANNEL_ID);
}

/** The channel the substitution messages are posted to, or `null` when unset. */
export function slackSubstitutionsChannelId(): string | null {
  return process.env.SLACK_SUBSTITUTIONS_CHANNEL_ID || null;
}

/**
 * Slack refused a request. Carries Slack's own error code (`channel_not_found`,
 * `not_in_channel`, `missing_scope`, …), which is the whole of what Slack says.
 */
export class SlackApiError extends Error {
  constructor(
    readonly slackCode: string,
    /** On `ratelimited`, how long Slack asked to wait, from its `Retry-After`. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(slackCode);
    this.name = "SlackApiError";
  }
}

/** The envelope every Web API answer shares. */
const slackEnvelope = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
});

/** Call a Web API method as the bot, answering its payload once `ok` is true. */
async function slackCall(method: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${SLACK_API_BASE}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  const envelope = slackEnvelope.safeParse(payload);
  if (!envelope.success) {
    throw new SlackApiError(`HTTP ${response.status}`);
  }
  if (!envelope.data.ok) {
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new SlackApiError(
      envelope.data.error ?? "unknown_error",
      Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null,
    );
  }
  return payload;
}

/**
 * Post plain text to a channel, named by its id (`C0123456789`) or its name,
 * with link and media previews off. A channel the bot cannot post to comes
 * back as a `SlackApiError`.
 */
export async function postSlackMessage(channel: string, text: string): Promise<void> {
  await slackCall("chat.postMessage", {
    channel,
    text,
    unfurl_links: false,
    unfurl_media: false,
  });
}

/** A Block Kit message: the blocks, and the text shown where they cannot be. */
export interface SlackBlocksMessage {
  text: string;
  blocks: readonly unknown[];
}

/** Where a posted message landed — the pair `chat.update` names it by. */
export interface PostedSlackMessage {
  channel: string;
  ts: string;
}

const postedMessage = z.object({ channel: z.string(), ts: z.string() });

/**
 * Post a Block Kit message, previews off, answering where it landed: the
 * channel's id (Slack resolves a name to it) and the message's `ts`.
 */
export async function postSlackBlocks(
  channel: string,
  message: SlackBlocksMessage,
): Promise<PostedSlackMessage> {
  const payload = await slackCall("chat.postMessage", {
    channel,
    text: message.text,
    blocks: message.blocks,
    unfurl_links: false,
    unfurl_media: false,
  });
  const parsed = postedMessage.safeParse(payload);
  if (!parsed.success) throw new SlackApiError("missing_ts");
  return parsed.data;
}

/** How many times one message of a set is retried after Slack rate-limits it. */
const MAX_RATE_LIMIT_RETRIES = 3;

/**
 * Post several Block Kit messages to one channel, in order. `chat.postMessage`
 * allows about one message a second per channel, so a set can be rate-limited
 * part way: the limited message waits out Slack's `Retry-After` and is sent
 * again, so the set arrives whole and in order. Any other refusal ends the set.
 */
export async function postSlackBlocksInOrder(
  channel: string,
  messages: readonly SlackBlocksMessage[],
): Promise<void> {
  for (const message of messages) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await postSlackBlocks(channel, message);
        break;
      } catch (error) {
        if (
          !(error instanceof SlackApiError) ||
          error.slackCode !== "ratelimited" ||
          attempt >= MAX_RATE_LIMIT_RETRIES
        ) {
          throw error;
        }
        const seconds = error.retryAfterSeconds ?? 1;
        await new Promise((done) => setTimeout(done, seconds * 1000));
      }
    }
  }
}

/** Replace a posted message's text and blocks in place. */
export async function updateSlackMessage(
  channel: string,
  ts: string,
  message: SlackBlocksMessage,
): Promise<void> {
  await slackCall("chat.update", {
    channel,
    ts,
    text: message.text,
    blocks: message.blocks,
  });
}

/**
 * Answer an interaction or a slash command through its `response_url` — the
 * way to send the presser an ephemeral reply after the 3-second window. The
 * URL is Slack's own and carries its authority, so no token is sent. Slack
 * answers a plain `ok` rather than the Web API's envelope, so the status is
 * what is read.
 */
export async function respondViaResponseUrl(url: string, body: unknown): Promise<void> {
  // The URL arrives in a signed payload, but it is still a URL the server is
  // about to POST to: anything not on Slack's own hooks host is refused.
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new SlackApiError("invalid_response_url");
  }
  if (target.protocol !== "https:" || target.hostname !== "hooks.slack.com") {
    throw new SlackApiError("invalid_response_url");
  }
  const response = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new SlackApiError(detail || `HTTP ${response.status}`);
  }
}
