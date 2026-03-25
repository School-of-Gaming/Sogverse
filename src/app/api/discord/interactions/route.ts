import { NextResponse } from "next/server";
import { after } from "next/server";
import {
  verifyKey,
  InteractionType,
  InteractionResponseType,
} from "discord-interactions";
import { askGeduFaq } from "@/lib/gemini";

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
    const question = interaction.data.options?.[0]?.value;

    if (!question) {
      return NextResponse.json({ type: InteractionResponseType.PONG });
    }

    // after() keeps the function alive after the response is sent,
    // so Vercel doesn't kill it before Gemini responds.
    after(sendFollowUp(interaction.token, question));

    return NextResponse.json({
      type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });
  }

  return NextResponse.json({ error: "Unknown interaction" }, { status: 400 });
}

async function sendFollowUp(interactionToken: string, question: string): Promise<void> {
  let answer: string;
  try {
    answer = await askGeduFaq(question);
  } catch (error) {
    console.error("Gemini error:", error);
    answer = "Pahoittelut, en pystynyt käsittelemään kysymystäsi. Yritä uudelleen.";
  }

  // Discord messages have a 2000 character limit
  if (answer.length > 2000) {
    answer = answer.slice(0, 1997) + "...";
  }

  await fetch(
    `https://discord.com/api/v10/webhooks/${DISCORD_APPLICATION_ID}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify({ content: answer }),
    }
  );
}
