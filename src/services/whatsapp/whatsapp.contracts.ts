import { z } from "zod";

/** Response of POST /api/admin/whatsapp/send. */
export const sendWhatsAppResponse = z.object({
  messageId: z.string(),
});
