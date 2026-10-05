import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import {
  verifyKey,
  InteractionType,
  InteractionResponseType,
} from "discord-interactions";
import { askGeduGuru, askHappinappi } from "@/lib/gemini";
import { resetPassword, type PasswordResetOutcome } from "@/lib/microsoft-graph";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin } from "@/lib/url";
import type { DiscordLinkTokenInsert } from "@/types";

// The Discord user who ran the command. `id` and `username` are read as
// unknown and narrowed where used, so a shape change Discord makes to either
// can only cost `/link` its answer, never break the webhook for every command.
const discordUser = z.object({
  id: z.unknown().optional(),
  username: z.unknown().optional(),
});

// Just the slice of Discord's interaction payload we use. Lenient on
// purpose — unknown fields and option value types Discord may add must not
// break the webhook.
const discordInteraction = z.object({
  type: z.number(),
  token: z.string().optional(),
  // In a server the caller is `member.user`; in a DM it is `user`.
  member: z.object({ user: discordUser.optional() }).optional(),
  user: discordUser.optional(),
  data: z
    .object({
      name: z.string(),
      options: z.array(z.object({ value: z.unknown() })).optional(),
    })
    .optional(),
});

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID!;

/** Only the caller sees the message (Discord's EPHEMERAL message flag). */
const EPHEMERAL = 1 << 6;
/** No link preview under the message (Discord's SUPPRESS_EMBEDS flag). */
const SUPPRESS_EMBEDS = 1 << 2;

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-signature-ed25519") ?? "";
  const timestamp = request.headers.get("x-signature-timestamp") ?? "";

  if (!(await verifyKey(body, signature, timestamp, DISCORD_PUBLIC_KEY))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const parsed = discordInteraction.safeParse(JSON.parse(body));
  if (!parsed.success) {
    return NextResponse.json({ error: "Unknown interaction" }, { status: 400 });
  }
  const interaction = parsed.data;

  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const command = interaction.data?.name;
    const value = interaction.data?.options?.[0]?.value;
    const message = typeof value === "string" ? value : undefined;
    const token = interaction.token;

    // `/link` takes no argument, so it is dispatched ahead of the check below
    // that every other command carries one. Its answer is a sign-in link for
    // the caller alone, so the deferred response is already ephemeral: that
    // flag decides the visibility of the reply which later replaces it.
    if (command === "link" && token) {
      const caller = interaction.member?.user ?? interaction.user;
      const id = caller?.id;
      const username = caller?.username;
      if (typeof id !== "string" || typeof username !== "string") {
        return NextResponse.json({ type: InteractionResponseType.PONG });
      }
      after(sendLinkUrl(token, { id, username }, request.headers));
      return NextResponse.json({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: { flags: EPHEMERAL },
      });
    }

    if (!command || !message || !token) {
      return NextResponse.json({ type: InteractionResponseType.PONG });
    }

    // All commands use deferred responses to avoid Discord's 3-second timeout on cold starts
    if (command === "reset-password") {
      after(sendPasswordReset(token, message));
    } else {
      after(sendFollowUp(token, command, message));
    }

    return NextResponse.json({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });
  }

  return NextResponse.json({ error: "Unknown interaction" }, { status: 400 });
}

async function patchDiscordResponse(
  interactionToken: string,
  content: string,
  flags?: number
) {
  await fetch(
    `https://discord.com/api/v10/webhooks/${DISCORD_APPLICATION_ID}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify(flags === undefined ? { content } : { content, flags }),
    }
  );
}

/**
 * Answer `/link` with a one-time URL that links the caller's Discord account
 * to whichever Gedu or admin account confirms it.
 *
 * Only the token's SHA-256 is stored, so the table never holds a usable token;
 * the raw value exists in this reply alone. The database gives it ten minutes
 * and spends it on first use. The path is bare on purpose: the proxy sends it
 * on to the reader's own locale with the query intact.
 */
async function sendLinkUrl(
  interactionToken: string,
  caller: { id: string; username: string },
  requestHeaders: Headers
): Promise<void> {
  let content: string;
  try {
    const origin = getOrigin(requestHeaders);
    const token = randomBytes(32).toString("base64url");
    const row: DiscordLinkTokenInsert = {
      token_hash: createHash("sha256").update(token).digest("hex"),
      discord_user_id: caller.id,
      discord_username: caller.username,
    };
    const { error } = await createAdminClient()
      .from("discord_link_tokens")
      .insert(row);
    if (error) throw error;

    content =
      "Open this link to connect your Discord account to your School of Gaming account:\n" +
      `${origin}/link-discord?token=${token}\n\n` +
      "The link expires in 10 minutes and works once.";
  } catch (error) {
    console.error("Discord link token error:", error);
    content = "Sorry, I couldn't create a link right now. Try /link again in a moment.";
  }

  await patchDiscordResponse(interactionToken, content, SUPPRESS_EMBEDS);
}

/**
 * The English sentence for a failed reset.
 *
 * These strings live here rather than in the Graph module because they are
 * Discord's copy, not the platform's: the same outcomes are rendered through
 * next-intl on the in-app tools card, and a sentence baked into the library
 * would be a sentence no locale could translate. Discord has no locale — it is
 * a staff channel — so its wording stays fixed, and it is fixed *verbatim*:
 * these are byte-for-byte the sentences the command has always sent.
 */
function discordFailureSentence(
  outcome: Extract<PasswordResetOutcome, { ok: false }>
): string {
  switch (outcome.code) {
    case "invalid_username":
      return "Invalid username. Provide just the username, not the full email.";
    // The one sentence here with no history behind it: the code is newer than
    // the command, so this is its wording rather than a preserved one.
    case "unsupported_domain":
      return `Only ${outcome.domains
        .map((domain) => `@${domain}`)
        .join(" and ")} accounts can be reset.`;
    case "azure_auth":
      return "Failed to authenticate with Azure. Check bot configuration.";
    case "graph_error":
      return `Microsoft Graph error: ${outcome.status}`;
    case "not_found":
      return `User "${outcome.username}" not found on ${outcome.domains
        .map((domain) => `@${domain}`)
        .join(" or ")}.`;
  }
}

async function sendPasswordReset(
  interactionToken: string,
  input: string
): Promise<void> {
  const usernames = input.split(/[\s,]+/).filter(Boolean);

  const results = await Promise.all(
    usernames.map(async (username) => {
      const result = await resetPassword(username);
      if (result.ok) {
        const line = `✅ **${result.upn}** → \`${result.password}\``;
        return result.forceChange ? `${line} (must change on sign-in)` : line;
      }
      return `❌ **${username}** — ${discordFailureSentence(result)}`;
    })
  );

  await patchDiscordResponse(interactionToken, results.join("\n"));
}

async function sendFollowUp(
  interactionToken: string,
  command: string,
  message: string
): Promise<void> {
  let answer: string;
  try {
    answer =
      command === "happinappi"
        ? await askHappinappi(message)
        : await askGeduGuru(message);
  } catch (error) {
    console.error("Gemini error:", error);
    answer =
      command === "happinappi"
        ? "HAPPEE! ...mutta jotain meni pieleen. Yritä uudelleen!"
        : "Pahoittelut, en pystynyt käsittelemään kysymystäsi. Yritä uudelleen.";
  }

  const reply = `**${message}**\n\n${answer}`;

  // Discord messages have a 2000 character limit
  const content = reply.length > 2000 ? reply.slice(0, 1997) + "..." : reply;

  await patchDiscordResponse(interactionToken, content);
}
