import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME } from "@/lib/constants";
import { templateRegistry } from "@/lib/email-templates/registry";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { escapeHtml } from "@/lib/email-templates/utils";
import { parseEmails } from "@/lib/utils";
import { resolveLocale } from "@/lib/constants/locales";

// --- Request schemas ---

// No `fromEmail`/`fromName`: sender identity is a constant now, not something a
// caller chooses. A harness that could send under any name would be testing a
// mail the product cannot produce.
const customSchema = z.object({
  mode: z.literal("custom"),
  provider: z.literal("brevo"),
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

    let subject: string;
    let htmlContent: string;
    // The plain-text body, for the template that states one. It is what a
    // Microsoft mailbox fills a calendar entry's notes from, so it travels with
    // the mail rather than being derived from the markup at the far end.
    let textContent: string | undefined;
    let replyToEmail: string | undefined;
    // Whatever the template composes beside its body. Free-form mode carries
    // none: an attachment is a property of a template's content, not something
    // an admin types into a box.
    let attachments: { name: string; contentBase64: string }[] | undefined;
    // The text of every text attachment, so the answer can show what was sent.
    let sentAttachments: { name: string; text: string }[] | undefined;

    if (body.mode === "custom") {
      subject = body.subject;
      // The one send that may end up with no Reply-To, deliberately: free-form
      // mode is a manual tool for checking the sending path works, never a way
      // to write to a customer, so the admin composing the message picks its
      // reply behaviour and a blank stays blank. Every *product* send states
      // its reply-to explicitly.
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

      // The context is stated rather than left to the default, because this
      // route is the send: what leaves here is fetched by a recipient's mail
      // client, so a fixture whose art only a dev machine can reach drops it.
      // The admin page's in-browser preview is the other half of that pair.
      // A builder may refuse the params it was given — a calendar invitation
      // whose run has nothing left in it is the case — and that refusal is an
      // answer about the request, not a fault of ours. It is answered the way
      // the schema's own refusal above is: a 400 carrying the message the
      // builder wrote for the admin to read.
      let rendered;
      try {
        rendered = tmpl.render(paramsParsed.data, t, locale, { to: "send" });
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 400 },
        );
      }
      subject = rendered.subject;
      htmlContent = rendered.html;
      textContent = rendered.text;
      // The template's own reply-to, so a test send lands the same way the live
      // mail does rather than silently defaulting to the sending address.
      replyToEmail = rendered.replyTo;
      // The file names go through untouched: the provider infers a media type
      // from the extension, so a name rewritten here would change how a client
      // reads the part — an `invite.ics` under another name arrives as a file
      // to download rather than as an invitation.
      attachments = rendered.attachments?.map(({ name, contentBase64 }) => ({
        name,
        contentBase64,
      }));
      // Read back to the admin, not sent: a calendar document states the
      // identifier the entry lives under, and a second message about the same
      // entry has to repeat it. Without this the identifier a send minted was
      // unreadable — the preview mints its own, so it could never be the one
      // that went out. Only text attachments have anything to show.
      sentAttachments = rendered.attachments
        ?.flatMap(({ name, text }) => (text === undefined ? [] : [{ name, text }]));
    }

    const emailResult = await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName: SENDER_NAME,
      toEmail: toEmails,
      subject,
      htmlContent,
      textContent,
      replyToEmail,
      attachments,
    });

    return {
      messageId: emailResult.messageId,
      ...(sentAttachments?.length && { attachments: sentAttachments }),
    };
  },
});
