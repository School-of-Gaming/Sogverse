import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

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

/** Extract message body and type from various WhatsApp message formats */
function extractMessageContent(message: Record<string, unknown>): {
  body: string | null;
  messageType: string;
} {
  const type = message.type as string;

  switch (type) {
    case "text": {
      const text = message.text as { body: string } | undefined;
      return { body: text?.body ?? null, messageType: "text" };
    }
    case "interactive": {
      const interactive = message.interactive as
        | { type: string; button_reply?: { title: string }; list_reply?: { title: string } }
        | undefined;
      if (interactive?.type === "button_reply") {
        return { body: interactive.button_reply?.title ?? null, messageType: "button_reply" };
      }
      if (interactive?.type === "list_reply") {
        return { body: interactive.list_reply?.title ?? null, messageType: "list_reply" };
      }
      return { body: null, messageType: "interactive" };
    }
    case "image":
      return { body: "[Image]", messageType: "image" };
    case "video":
      return { body: "[Video]", messageType: "video" };
    case "audio":
      return { body: "[Audio]", messageType: "audio" };
    case "document":
      return { body: "[Document]", messageType: "document" };
    case "sticker":
      return { body: "[Sticker]", messageType: "sticker" };
    case "location":
      return { body: "[Location]", messageType: "location" };
    case "contacts":
      return { body: "[Contact]", messageType: "contacts" };
    default:
      return { body: `[${type}]`, messageType: type };
  }
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

/** Receive incoming WhatsApp messages and delivery status updates */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const admin = createAdminClient();

  const entries = body.entry ?? [];
  for (const entry of entries) {
    const changes = entry.changes ?? [];
    for (const change of changes) {
      if (change.field !== "messages") continue;

      // --- Inbound messages ---
      const contacts = change.value?.contacts ?? [];
      const contactMap = new Map<string, string>();
      for (const contact of contacts) {
        contactMap.set(contact.wa_id, contact.profile?.name ?? null);
      }

      const messages = change.value?.messages ?? [];
      for (const message of messages) {
        const phone = message.from as string;
        const waName = contactMap.get(phone) ?? null;
        const { body: msgBody, messageType } = extractMessageContent(message);

        // Upsert contact
        await admin.from("whatsapp_contacts").upsert(
          {
            phone,
            wa_name: waName,
            last_message_at: new Date().toISOString(),
          },
          { onConflict: "phone" }
        );

        // Insert message
        await admin.from("whatsapp_messages").insert({
          id: message.id as string,
          phone,
          direction: "inbound",
          body: msgBody,
          message_type: messageType,
          raw_payload: message,
          created_at: new Date().toISOString(),
        });
      }

      // --- Delivery status updates (sent → delivered → read, or failed) ---
      const statuses = change.value?.statuses ?? [];
      for (const status of statuses) {
        const msgId = status.id as string;
        const statusValue = status.status as string;

        // Only update statuses we track
        if (!["sent", "delivered", "read", "failed"].includes(statusValue)) continue;

        const update: Record<string, unknown> = { status: statusValue };

        if (statusValue === "failed") {
          const errorCode = status.errors?.[0]?.code;
          const rawTitle = status.errors?.[0]?.title ?? "";

          // Map Meta's technical error titles to support-friendly messages
          let errorMsg: string;
          if (errorCode === 131047 || rawTitle.toLowerCase().includes("re-engage")) {
            errorMsg =
              "Not delivered — over 24 hours since the customer last messaged us. They need to message us first before we can reply.";
          } else if (errorCode === 131026 || rawTitle.toLowerCase().includes("not able to send")) {
            errorMsg = "Not delivered — this phone number is not on WhatsApp.";
          } else {
            errorMsg = rawTitle || "Message delivery failed";
          }

          update.status_error = errorMsg;
        }

        await admin
          .from("whatsapp_messages")
          .update(update)
          .eq("id", msgId);
      }
    }
  }

  // Meta requires a 200 response, otherwise it retries
  return NextResponse.json({ received: true });
}
