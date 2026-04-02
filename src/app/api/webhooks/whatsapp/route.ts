import { NextResponse } from "next/server";
import crypto from "crypto";

const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN!;
const appSecret = process.env.WHATSAPP_APP_SECRET!;

/** Verify that the request came from Meta using X-Hub-Signature-256 */
function verifySignature(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(body).digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

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
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

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
