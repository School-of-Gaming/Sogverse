import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const requestSchema = z.object({
  to: z.string().min(1),
  body: z.string().min(1).max(4096),
});

export async function POST(request: Request) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can send WhatsApp messages",
    });
    if (result instanceof NextResponse) return result;

    const json = await request.json();
    const parsed = requestSchema.safeParse(json);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: `${firstError.path.join(".")}: ${firstError.message}` },
        { status: 400 },
      );
    }

    const { to, body } = parsed.data;

    const { messageId } = await sendWhatsAppMessage(to, {
      type: "text",
      body,
    });

    // Store outbound message and upsert contact.
    // DB errors are not checked — the message is already sent to Meta at this
    // point, so failing the request would mislead the admin. A DB failure here
    // is near-impossible anyway (service role, no RLS, no token expiry).
    const admin = createAdminClient();
    const now = new Date().toISOString();

    await admin.from("whatsapp_contacts").upsert(
      { phone: to.replace(/^\+/, ""), last_message_at: now },
      { onConflict: "phone" }
    );

    await admin.from("whatsapp_messages").insert({
      id: messageId,
      phone: to.replace(/^\+/, ""),
      direction: "outbound",
      body,
      message_type: "text",
      status: "pending",
      created_at: now,
    });

    return NextResponse.json({ messageId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
