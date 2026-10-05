import "server-only";
import { z } from "zod";

/**
 * Calling Discord's REST API as this environment's bot.
 *
 * The token is the environment's own `DISCORD_BOT_TOKEN`, so staging and local
 * act as the staging app's bot and production as the prod app's. Discord
 * refuses a bot request without a `DiscordBot` User-Agent, so every call made
 * here carries one.
 */

export const DISCORD_API_BASE = "https://discord.com/api/v10";

export function discordBotHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
    "User-Agent": "DiscordBot (https://sog.gg, 1)",
  };
}

/**
 * Discord refused a request. Carries Discord's own message and numeric error
 * code (50007 is "Cannot send messages to this user", the usual answer when
 * the bot shares no server with the recipient or they have DMs closed).
 */
export class DiscordApiError extends Error {
  constructor(
    readonly status: number,
    readonly discordCode: number | null,
    message: string,
  ) {
    super(message);
    this.name = "DiscordApiError";
  }
}

/** The slice of Discord's error body worth showing: its message and code. */
const discordErrorBody = z.object({
  code: z.number().optional(),
  message: z.string().optional(),
});

async function discordPost(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    method: "POST",
    headers: discordBotHeaders(),
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = discordErrorBody.safeParse(payload);
    throw new DiscordApiError(
      response.status,
      parsed.success ? (parsed.data.code ?? null) : null,
      parsed.success && parsed.data.message
        ? parsed.data.message
        : `HTTP ${response.status}`,
    );
  }
  return payload;
}

const withId = z.object({ id: z.string() });

function idOf(payload: unknown, what: string): string {
  const parsed = withId.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Discord answered the ${what} request without an id`);
  }
  return parsed.data.id;
}

export interface SentDiscordMessage {
  channelId: string;
  messageId: string;
  /** A link that opens the message in Discord. */
  jumpUrl: string;
}

/**
 * Open (or reuse) the bot's DM channel with a Discord user and post a message
 * there. A bot can only DM someone it shares a server with, and Discord
 * answers anyone else with a refusal, thrown here as a `DiscordApiError`.
 */
export async function sendDiscordDirectMessage(
  recipientId: string,
  message: unknown,
): Promise<SentDiscordMessage> {
  const channelId = idOf(
    await discordPost("/users/@me/channels", { recipient_id: recipientId }),
    "DM channel",
  );
  const messageId = idOf(
    await discordPost(`/channels/${channelId}/messages`, message),
    "message",
  );
  return {
    channelId,
    messageId,
    jumpUrl: `https://discord.com/channels/@me/${channelId}/${messageId}`,
  };
}
