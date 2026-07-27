import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendWhatsAppResponse } from "@/services/whatsapp/whatsapp.contracts";
import { WHATSAPP_DIRECTION, WHATSAPP_MESSAGE_STATUS } from "@/types";

const requestSchema = z.object({
  // No format validation — `to` always comes from a whatsapp_contacts row
  // created by the inbound webhook, so it's a known-valid WhatsApp number.
  to: z.string().min(1),
  body: z.string().min(1).max(4096),
});

/**
 * POST /api/admin/whatsapp/send
 *
 * Sends an outbound text through the Graph API, then records it. Neither DB
 * write fails the request: the message is already at Meta by then, so a 500
 * would tell the admin their message didn't send when it did.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can send WhatsApp messages",
  body: requestSchema,
  response: sendWhatsAppResponse,

  // The Graph client throws on a non-OK response, and that message used to be
  // returned to the admin as a 500 body — incidental forwarding of a third
  // party's error text. It is now logged and answered generically.

  handler: async ({ supabase, body: { to, body } }) => {
    const { messageId } = await sendWhatsAppMessage(to, { type: "text", body });

    // Both writes run on the USER-bound client: the whatsapp_contacts
    // insert/update and whatsapp_messages insert policies each re-check that
    // the caller is an admin, and the message policy additionally pins
    // `direction` to outbound — so this route cannot forge inbound history
    // even if it tried.
    //
    // Failures are logged rather than thrown — under RLS a DB refusal here is
    // a real signal (it used to be near-impossible under service role), so it
    // must not be swallowed silently.
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

    return { messageId };
  },
});
