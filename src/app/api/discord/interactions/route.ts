import { NextResponse } from "next/server";
import { after } from "next/server";
import {
  verifyKey,
  InteractionType,
  InteractionResponseType,
} from "discord-interactions";
import { askGeduGuru, askHappinappi } from "@/lib/gemini";
import { resetPassword } from "@/lib/microsoft-graph";

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

  const interaction = JSON.parse(body);

  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const command = interaction.data.name as string;
    const message = interaction.data.options?.[0]?.value;

    if (!message) {
      return NextResponse.json({ type: InteractionResponseType.PONG });
    }

    if (command === "reset-password") {
      const result = await resetPassword(message);
      const content = result.ok
        ? `Password reset for **${result.upn}**\nNew password: \`${result.password}\``
        : `Failed: ${result.error}`;
      return NextResponse.json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content },
      });
    }

    after(sendFollowUp(interaction.token, command, message));

    return NextResponse.json({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });
  }

  return NextResponse.json({ error: "Unknown interaction" }, { status: 400 });
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
