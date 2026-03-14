import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL } from "@/lib/constants";
import { templateRegistry, type TemplateParams } from "@/lib/email-templates/registry";
import { escapeHtml } from "@/lib/email-templates/utils";
import { parseEmails } from "@/lib/utils";
import { z } from "zod";

// --- Request schemas ---

const customSchema = z.object({
  mode: z.literal("custom"),
  provider: z.literal("brevo"),
  fromEmail: z.string().email(),
  fromName: z.string().min(1),
  toEmail: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  replyToEmail: z.string().email().optional(),
});

const templateSchema = z.object({
  mode: z.literal("template"),
  toEmail: z.string().min(1),
  template: z.string(),
  params: z.record(z.string().nullable()),
});

const requestSchema = z.discriminatedUnion("mode", [customSchema, templateSchema]);

export async function POST(request: Request) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can send test emails",
    });
    if (result instanceof NextResponse) return result;

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: `${firstError.path.join(".")}: ${firstError.message}` },
        { status: 400 },
      );
    }

    const toEmails = parseEmails(parsed.data.toEmail);
    const emailSchema = z.string().email();
    for (const email of toEmails) {
      if (!emailSchema.safeParse(email).success) {
        return NextResponse.json(
          { error: `Invalid email: ${email}` },
          { status: 400 },
        );
      }
    }

    let fromName: string;
    let subject: string;
    let htmlContent: string;
    let replyToEmail: string | undefined;

    if (parsed.data.mode === "custom") {
      fromName = parsed.data.fromName;
      subject = parsed.data.subject;
      replyToEmail = parsed.data.replyToEmail;
      htmlContent = escapeHtml(parsed.data.body).replace(/\n/g, "<br/>");
    } else {
      if (!(parsed.data.template in templateRegistry)) {
        return NextResponse.json(
          { error: `Unknown template: ${parsed.data.template}` },
          { status: 400 },
        );
      }
      const tmpl = templateRegistry[parsed.data.template];

      const paramsParsed = tmpl.schema.safeParse(parsed.data.params);
      if (!paramsParsed.success) {
        const firstError = (paramsParsed as z.SafeParseError<unknown>).error.errors[0];
        return NextResponse.json(
          { error: `params.${firstError.path.join(".")}: ${firstError.message}` },
          { status: 400 },
        );
      }

      const validatedParams = paramsParsed.data as TemplateParams;
      fromName = tmpl.fromName;
      subject = tmpl.subject(validatedParams);
      htmlContent = tmpl.build(validatedParams);
    }

    const emailResult = await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName,
      toEmail: toEmails,
      subject,
      htmlContent,
      replyToEmail,
    });

    return NextResponse.json({ messageId: emailResult.messageId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
