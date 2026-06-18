import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { WHATSAPP_DIRECTION, WHATSAPP_MESSAGE_STATUS } from "@/types";
import type { Json, WhatsAppMessageUpdate } from "@/types";

const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN!;
const appSecret = process.env.WHATSAPP_APP_SECRET!;

/** Verify that the request came from Meta using X-Hub-Signature-256 */
function verifySignature(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(body).digest("hex");
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

// --- Payload schemas ---
//
// Deliberately lenient: they cover ONLY the fields this route reads, unknown
// fields are stripped (the full message still lands in raw_payload), and the
// optional sub-objects degrade to `undefined` via .catch() instead of failing
// the whole item. Meta disables webhook endpoints that error persistently, so
// an unexpected shape must never 500 — items that fail even these minimal
// requirements are logged and skipped.

/**
 * `Json`-typed mirror of a JSON.parse result, used to persist the raw inbound
 * message without a cast. The value already came from JSON.parse of an
 * HMAC-verified body, so parsing with this schema cannot realistically fail.
 */
const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(jsonSchema),
  ])
);

const inboundMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional().catch(undefined),
  interactive: z
    .object({
      type: z.string(),
      button_reply: z.object({ title: z.string() }).optional(),
      list_reply: z.object({ title: z.string() }).optional(),
    })
    .optional()
    .catch(undefined),
});
type InboundMessage = z.infer<typeof inboundMessageSchema>;

const statusUpdateSchema = z.object({
  id: z.string(),
  status: z.string(),
  errors: z
    .array(
      z.object({
        code: z.number().optional().catch(undefined),
        title: z.string().optional().catch(undefined),
      })
    )
    .optional()
    .catch(undefined),
});

const contactSchema = z.object({
  wa_id: z.string(),
  profile: z
    .object({ name: z.string().optional() })
    .optional()
    .catch(undefined),
});

const webhookBodySchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              field: z.string().optional(),
              value: z
                .object({
                  contacts: z.array(z.unknown()).optional(),
                  messages: z.array(z.unknown()).optional(),
                  statuses: z.array(z.unknown()).optional(),
                })
                .optional(),
            })
          )
          .optional(),
      })
    )
    .optional(),
});

/** Extract message body and type from various WhatsApp message formats */
function extractMessageContent(message: InboundMessage): {
  body: string | null;
  messageType: string;
} {
  switch (message.type) {
    case "text":
      return { body: message.text?.body ?? null, messageType: "text" };
    case "interactive": {
      const interactive = message.interactive;
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
      return { body: `[${message.type}]`, messageType: message.type };
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

  // Safe to parse without try/catch — the HMAC check above guarantees
  // this is the exact payload Meta sent, and Meta always sends valid JSON.
  const parsedBody = webhookBodySchema.safeParse(JSON.parse(rawBody));
  if (!parsedBody.success) {
    // Unexpected envelope — acknowledge anyway (Meta disables endpoints that
    // error persistently) and log so we notice the shape change.
    console.error(
      "[whatsapp webhook] unexpected payload shape:",
      parsedBody.error.message
    );
    return NextResponse.json({ received: true });
  }
  const admin = createAdminClient();

  for (const entry of parsedBody.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      // --- Inbound messages ---
      const contactMap = new Map<string, string | null>();
      for (const rawContact of change.value?.contacts ?? []) {
        const contact = contactSchema.safeParse(rawContact);
        if (!contact.success) continue;
        contactMap.set(contact.data.wa_id, contact.data.profile?.name ?? null);
      }

      for (const rawMessage of change.value?.messages ?? []) {
        const parsedMessage = inboundMessageSchema.safeParse(rawMessage);
        if (!parsedMessage.success) {
          console.error(
            "[whatsapp webhook] skipping message with unexpected shape:",
            parsedMessage.error.message
          );
          continue;
        }
        const message = parsedMessage.data;
        // Cannot fail — rawMessage came from JSON.parse (see jsonSchema doc).
        const rawPayload = jsonSchema.safeParse(rawMessage);

        const phone = message.from;
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

        // Upsert message — Meta retries webhook deliveries on transient
        // failures, so duplicate message IDs are expected.
        await admin.from("whatsapp_messages").upsert(
          {
            id: message.id,
            phone,
            direction: WHATSAPP_DIRECTION.INBOUND,
            status: WHATSAPP_MESSAGE_STATUS.RECEIVED,
            body: msgBody,
            message_type: messageType,
            raw_payload: rawPayload.success ? rawPayload.data : null,
            created_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
      }

      // --- Delivery status updates (sent → delivered → read, or failed) ---
      for (const rawStatus of change.value?.statuses ?? []) {
        const parsedStatus = statusUpdateSchema.safeParse(rawStatus);
        if (!parsedStatus.success) {
          console.error(
            "[whatsapp webhook] skipping status update with unexpected shape:",
            parsedStatus.error.message
          );
          continue;
        }
        const status = parsedStatus.data;
        const msgId = status.id;
        const statusValue = status.status;

        // Only update statuses we track
        const trackableStatuses: string[] = [
          WHATSAPP_MESSAGE_STATUS.SENT,
          WHATSAPP_MESSAGE_STATUS.DELIVERED,
          WHATSAPP_MESSAGE_STATUS.READ,
          WHATSAPP_MESSAGE_STATUS.FAILED,
        ];
        if (!trackableStatuses.includes(statusValue)) continue;

        const update: WhatsAppMessageUpdate = { status: statusValue };

        if (statusValue === WHATSAPP_MESSAGE_STATUS.FAILED) {
          const errorCode = status.errors?.[0]?.code;
          const rawTitle = status.errors?.[0]?.title ?? "";

          // Map Meta's technical error titles to support-friendly messages
          let errorMsg: string;
          if (errorCode === 131047 || rawTitle.toLowerCase().includes("re-engage")) {
            errorMsg =
              "Not delivered — over 24 hours since the customer last messaged us. They need to message us first before we can reply.";
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
