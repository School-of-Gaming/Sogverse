import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import {
  verifyKey,
  InteractionType,
  InteractionResponseType,
} from "discord-interactions";
import { askGeduGuru, askHappinappi } from "@/lib/gemini";
import { resetPassword } from "@/lib/microsoft-graph";

// Just the slice of Discord's interaction payload we use. Lenient on
// purpose — unknown fields and option value types Discord may add must not
// break the webhook.
const discordInteraction = z.object({
  type: z.number(),
  token: z.string().optional(),
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

async function patchDiscordResponse(interactionToken: string, content: string) {
  await fetch(
    `https://discord.com/api/v10/webhooks/${DISCORD_APPLICATION_ID}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify({ content }),
    }
  );
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
      return `❌ **${username}** — ${result.error}`;
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
