import { NextResponse } from "next/server";

const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN!;

/** Meta webhook verification challenge */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === verifyToken) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** Receive incoming WhatsApp messages */
export async function POST(request: Request) {
  const body = await request.json();

  const entries = body.entry ?? [];
  for (const entry of entries) {
    const changes = entry.changes ?? [];
    for (const change of changes) {
      if (change.field !== "messages") continue;

      const messages = change.value?.messages ?? [];
      for (const message of messages) {
        console.log("[WhatsApp] Message received:", {
          from: message.from,
          type: message.type,
          text: message.text?.body ?? null,
          timestamp: message.timestamp,
        });
      }
    }
  }

  // Meta requires a 200 response, otherwise it retries
  return NextResponse.json({ received: true });
}
