import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if ((profile as { role: string } | null)?.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can send test emails" },
        { status: 403 }
      );
    }

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

    const result = await sendTransactionalEmail({
      fromEmail,
      fromName,
      toEmail,
      subject,
      htmlContent,
      replyToEmail,
    });

    return NextResponse.json({ messageId: result.messageId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
