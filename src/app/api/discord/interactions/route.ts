import { NextResponse } from "next/server";
import { askGeduFaq } from "@/lib/gemini";

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;

// Discord interaction types
const PING = 1;
const APPLICATION_COMMAND = 2;

// Discord response types
const PONG = 1;
const DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5;

function hexToUint8Array(hex: string): Uint8Array {
  const pairs = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(pairs.map((byte) => parseInt(byte, 16)));
}

async function verifyDiscordSignature(
  body: string,
  signature: string,
  timestamp: string
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToUint8Array(DISCORD_PUBLIC_KEY),
      "Ed25519",
      false,
      ["verify"]
    );
    return crypto.subtle.verify(
      "Ed25519",
      key,
      hexToUint8Array(signature),
      new TextEncoder().encode(timestamp + body)
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  if (!(await verifyDiscordSignature(body, signature, timestamp))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const interaction = JSON.parse(body);

  // Respond to Discord's ping verification
  if (interaction.type === PING) {
    return NextResponse.json({ type: PONG });
  }

  if (interaction.type === APPLICATION_COMMAND) {
    const question = interaction.data.options?.[0]?.value;

    if (!question) {
      return NextResponse.json({ type: PONG });
    }

    // Defer the response — Gemini may take more than 3 seconds
    const interactionToken = interaction.token;

    // Send deferred response immediately, then follow up
    sendFollowUp(interactionToken, question).catch(console.error);

    return NextResponse.json({
      type: DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    });
  }

  return NextResponse.json({ error: "Unknown interaction" }, { status: 400 });
}

async function sendFollowUp(
  interactionToken: string,
  question: string
): Promise<void> {
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
    `https://discord.com/api/v10/webhooks/${process.env.DISCORD_APPLICATION_ID}/${interactionToken}/messages/@original`,
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
