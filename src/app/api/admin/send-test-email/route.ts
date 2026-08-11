import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL } from "@/lib/constants";
import { templateRegistry } from "@/lib/email-templates/registry";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { escapeHtml } from "@/lib/email-templates/utils";
import { parseEmails } from "@/lib/utils";
import { resolveLocale } from "@/lib/constants/locales";

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
  // The same union the registry's `TemplateParams` declares: a param is a
  // string, a variant flag the testing UI's select expands into a boolean
  // (`isSelfSeat`), or null. Kept this narrow rather than `z.unknown()`
  // because this is the outer gate — the per-template schema behind it is the
  // one that names each key, and a wire schema that admits anything makes a
  // malformed body a per-template error message instead of a wire-shape one.
  params: z.record(z.union([z.string(), z.boolean()]).nullable()),
  locale: z.string().optional(),
});

const requestSchema = z.discriminatedUnion("mode", [customSchema, templateSchema]);

/**
 * POST /api/admin/send-test-email
 *
 * The admin email-preview harness: render either a hand-written message or a
 * registered template, and send it through the transactional provider.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can send test emails",
  body: requestSchema,

  // No database calls, so the shared error table never comes into play. What
  // changes is the catch-all: a provider failure used to be returned to the
  // admin as a 500 carrying the thrown message, which is the incidental
  // forwarding shape. It is now logged and answered generically.

  handler: async ({ body }) => {
    const toEmails = parseEmails(body.toEmail);
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

    if (body.mode === "custom") {
      fromName = body.fromName;
      subject = body.subject;
      replyToEmail = body.replyToEmail;
      htmlContent = escapeHtml(body.body).replace(/\n/g, "<br/>");
    } else {
      if (!(body.template in templateRegistry)) {
        return NextResponse.json(
          { error: `Unknown template: ${body.template}` },
          { status: 400 },
        );
      }
      const tmpl = templateRegistry[body.template];

      const paramsParsed = tmpl.schema.safeParse(body.params);
      if (!paramsParsed.success) {
        const firstError = paramsParsed.error.errors[0];
        return NextResponse.json(
          { error: `params.${firstError.path.join(".")}: ${firstError.message}` },
          { status: 400 },
        );
      }

      const locale = resolveLocale(body.locale);
      const t = await getEmailTranslator(locale);

      fromName = t(tmpl.fromNameKey);
      const rendered = tmpl.render(paramsParsed.data, t, locale);
      subject = rendered.subject;
      htmlContent = rendered.html;
    }

    const emailResult = await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName,
      toEmail: toEmails,
      subject,
      htmlContent,
      replyToEmail,
    });

    return { messageId: emailResult.messageId };
  },
});
