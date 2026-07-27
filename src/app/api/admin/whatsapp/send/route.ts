import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { WHATSAPP_DIRECTION, WHATSAPP_MESSAGE_STATUS } from "@/types";
import { z } from "zod";

const requestSchema = z.object({
  // No format validation — `to` always comes from a whatsapp_contacts row
  // created by the inbound webhook, so it's a known-valid WhatsApp number.
  to: z.string().min(1),
  body: z.string().min(1).max(4096),
});

export async function POST(request: Request) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can send WhatsApp messages",
    });
    if (result instanceof NextResponse) return result;
    const { supabase } = result;

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

    // Store outbound message and upsert contact on the USER-bound client: the
    // whatsapp_contacts insert/update and whatsapp_messages insert policies each
    // re-check that the caller is an admin, and the message policy additionally
    // pins `direction` to outbound — so this route cannot forge inbound history
    // even if it tried.
    //
    // Neither failure fails the request: the message is already at Meta by this
    // point, so a 500 would tell the admin their message didn't send when it
    // did. They are logged instead — under RLS a DB refusal here is a real
    // signal (it used to be near-impossible under service role), so it must not
    // be swallowed silently.
    const now = new Date().toISOString();

    const { error: contactError } = await supabase
      .from("whatsapp_contacts")
      .upsert({ phone: to, last_message_at: now }, { onConflict: "phone" });
    if (contactError) {
      console.error("[whatsapp/send] contact upsert failed", contactError);
    }

    const { error: messageError } = await supabase
      .from("whatsapp_messages")
      .insert({
        id: messageId,
        phone: to,
        direction: WHATSAPP_DIRECTION.OUTBOUND,
        body,
        message_type: "text",
        status: WHATSAPP_MESSAGE_STATUS.PENDING,
        created_at: now,
      });
    if (messageError) {
      console.error("[whatsapp/send] message insert failed", messageError);
    }

    return NextResponse.json({ messageId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
