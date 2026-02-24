import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { sendTransactionalEmail } from "@/lib/brevo";
import { z } from "zod";

const sendTestEmailSchema = z.object({
  provider: z.literal("brevo"),
  fromEmail: z.string().email(),
  fromName: z.string().min(1),
  toEmail: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  replyToEmail: z.string().email().optional(),
});

export async function POST(request: Request) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can send test emails",
    });
    if (result instanceof NextResponse) return result;

    const body = await request.json();
    const parsed = sendTestEmailSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: `${firstError.path.join(".")}: ${firstError.message}` },
        { status: 400 }
      );
    }

    const { fromEmail, fromName, toEmail, subject, body: textBody, replyToEmail } = parsed.data;

    // Convert plain-text body to minimal HTML
    const htmlContent = textBody
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");

    const result2 = await sendTransactionalEmail({
      fromEmail,
      fromName,
      toEmail,
      subject,
      htmlContent,
      replyToEmail,
    });

    return NextResponse.json({ messageId: result2.messageId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
